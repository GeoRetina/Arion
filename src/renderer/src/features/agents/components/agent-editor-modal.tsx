import React, { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { AgentDefinition } from '@/../../shared/types/agent-types'
import { useAgentStore } from '@/stores/agent-store'
import { LLMProviderType } from '@/../../shared/ipc-types'
import { Loader2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Slider } from '@/components/ui/slider'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useLLMStore } from '@/stores/llm-store'
import {
  SUPPORTED_LLM_PROVIDERS,
  getFormattedProviderName,
  PROVIDER_LOGOS,
  PROVIDER_BACKGROUNDS,
  PROVIDER_CONFIG_KEYS
} from '@/constants/llm-providers'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { useAgentTools } from '@/hooks/use-agent-tools'

interface AgentEditorModalProps {
  agentId: string | null
  isOpen: boolean
  onClose: () => void
}

const AgentEditorModal: React.FC<AgentEditorModalProps> = ({ agentId, isOpen, onClose }) => {
  const [agent, setAgent] = useState<AgentDefinition | null>(null)
  const [activeTab, setActiveTab] = useState('general')
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Get agent store functions
  const { getAgentById, updateAgent, agents } = useAgentStore()

  // Access LLM store for provider and model information
  const { openaiConfig, googleConfig, anthropicConfig, azureConfig, vertexConfig, ollamaConfig } =
    useLLMStore()

  // State to hold full agent details for tool checking (excluding current agent)
  const [otherAgents, setOtherAgents] = useState<AgentDefinition[]>([])

  // Load full agent details (excluding current agent) when modal opens
  useEffect(() => {
    if (isOpen && agents.length > 0 && agentId) {
      const loadOtherAgentDetails = async (): Promise<void> => {
        // Filter out the current agent being edited
        const otherAgentsList = agents.filter((a) => a.id !== agentId)
        const fullAgentPromises = otherAgentsList.map((a) => getAgentById(a.id))
        const fullAgentResults = await Promise.all(fullAgentPromises)
        const validAgents = fullAgentResults.filter((a): a is AgentDefinition => a !== null)
        setOtherAgents(validAgents)
      }
      loadOtherAgentDetails()
    }
  }, [isOpen, agents, agentId, getAgentById])

  // Use the agent tools hook to manage available tools
  // Pass other agents (excluding current) so current agent's tools are shown as available
  const {
    allTools,
    isLoading: isLoadingTools,
    error: toolsError
  } = useAgentTools(otherAgents, isOpen)

  // Load agent data when modal opens or agentId changes
  useEffect(() => {
    const loadAgent = async (): Promise<void> => {
      if (isOpen && agentId) {
        setIsLoading(true)
        try {
          const loadedAgent = await getAgentById(agentId)
          setAgent(loadedAgent)
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'
          toast.error('Failed to load agent', {
            description: errorMessage
          })
        } finally {
          setIsLoading(false)
        }
      }
    }

    loadAgent()
  }, [isOpen, agentId, getAgentById])

  // Reset state when modal closes
  const handleClose = (): void => {
    onClose()
  }

  // Handle saving agent changes
  const handleSave = async (): Promise<void> => {
    if (!agent || !agentId) return

    // Validate all required fields regardless of active tab
    if (!agent.name.trim()) {
      toast.error('Agent name is required')
      setActiveTab('general')
      return
    }

    if (!agent.description.trim()) {
      toast.error('Agent description is required')
      setActiveTab('general')
      return
    }

    // Check if agent prompt is filled
    const agentPrompt = agent.promptConfig.coreModules.find(
      (m) => m.moduleId === 'user-defined-prompt'
    )?.parameters?.content
    if (!agentPrompt || !agentPrompt.trim()) {
      toast.error('Agent prompt is required')
      setActiveTab('prompts')
      return
    }

    if (!agent.modelConfig.provider) {
      toast.error('LLM provider is required')
      setActiveTab('model')
      return
    }

    if (!agent.modelConfig.model) {
      toast.error('Model is required')
      setActiveTab('model')
      return
    }

    setIsSaving(true)
    try {
      await updateAgent(agentId, {
        name: agent.name,
        description: agent.description,
        icon: agent.icon,
        capabilities: agent.capabilities,
        promptConfig: agent.promptConfig,
        modelConfig: agent.modelConfig,
        toolAccess: agent.toolAccess,
        memoryConfig: agent.memoryConfig,
        relationships: agent.relationships
      })

      toast.success('Agent updated successfully')
      handleClose()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      toast.error('Failed to update agent', {
        description: errorMessage
      })
    } finally {
      setIsSaving(false)
    }
  }

  // Handle agent field updates
  const updateAgentField = (field: keyof AgentDefinition, value: unknown): void => {
    if (!agent) return

    setAgent({
      ...agent,
      [field]: value
    })
  }

  // Toggle tool selection for the capability
  const toggleToolSelection = (toolId: string): void => {
    if (!agent || agent.capabilities.length === 0) return

    const capability = agent.capabilities[0]
    let updatedTools: string[]

    if (capability.tools.includes(toolId)) {
      updatedTools = capability.tools.filter((id) => id !== toolId)
    } else {
      updatedTools = [...capability.tools, toolId]
    }

    const updatedCapability = {
      ...capability,
      tools: updatedTools
    }

    updateAgentField('capabilities', [updatedCapability])
  }

  // Update model config parameter
  const updateModelParameter = (parameter: string, value: unknown): void => {
    if (!agent) return

    const updatedModelConfig = {
      ...agent.modelConfig,
      parameters: {
        ...agent.modelConfig.parameters,
        [parameter]: value
      }
    }

    updateAgentField('modelConfig', updatedModelConfig)
  }

  // Helper to get parameter value with fallback default
  const getParameterValue = (parameter: string, defaultValue: number): number => {
    const value = agent?.modelConfig.parameters?.[parameter]
    return typeof value === 'number' ? value : defaultValue
  }

  const readModelFromConfig = (config: unknown, configKey: string): string | null => {
    if (!config || typeof config !== 'object') return null
    const modelValue = (config as Record<string, unknown>)[configKey]
    return typeof modelValue === 'string' && modelValue.length > 0 ? modelValue : null
  }

  // Get available models based on selected provider
  const availableModels = React.useMemo<string[]>(() => {
    if (!agent?.modelConfig.provider) return []

    // Map of provider IDs to their config objects
    const configMap: Record<NonNullable<LLMProviderType>, unknown> = {
      openai: openaiConfig,
      google: googleConfig,
      anthropic: anthropicConfig,
      azure: azureConfig,
      vertex: vertexConfig,
      ollama: ollamaConfig
    }

    const config = configMap[agent.modelConfig.provider as NonNullable<LLMProviderType>]
    const configKey =
      PROVIDER_CONFIG_KEYS[agent.modelConfig.provider as NonNullable<LLMProviderType>]
    const model = readModelFromConfig(config, configKey)
    return model ? [model] : []
  }, [
    agent?.modelConfig.provider,
    openaiConfig,
    googleConfig,
    anthropicConfig,
    azureConfig,
    vertexConfig,
    ollamaConfig
  ])

  if (isLoading) {
    return (
      <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
        <DialogContent className="sm:max-w-[700px]">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  if (!agent) {
    return null
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[700px] max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Edit Agent: {agent.name}</DialogTitle>
          <DialogDescription>
            Configure the agent&apos;s capabilities, prompt, and model settings.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(80vh-200px)] mt-4">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full pr-4">
            <TabsList className="grid grid-cols-4 mb-4">
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="prompts">Prompts</TabsTrigger>
              <TabsTrigger value="capabilities">Capabilities</TabsTrigger>
              <TabsTrigger value="model">Model</TabsTrigger>
            </TabsList>

            {/* General Settings Tab */}
            <TabsContent value="general" className="space-y-4">
              <div className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="name" className="flex items-center gap-1">
                    Name <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="name"
                    value={agent.name}
                    onChange={(e) => updateAgentField('name', e.target.value)}
                    required
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="description" className="flex items-center gap-1">
                    Description <span className="text-red-500">*</span>
                  </Label>
                  <Textarea
                    id="description"
                    value={agent.description}
                    onChange={(e) => updateAgentField('description', e.target.value)}
                    rows={3}
                    required
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="type">Type</Label>
                  <Badge variant={agent.type === 'system' ? 'outline' : 'default'}>
                    {agent.type === 'system' ? 'System Agent' : 'User-defined Agent'}
                  </Badge>
                  <p className="text-xs text-muted-foreground mt-1">
                    {agent.type === 'system'
                      ? 'System agents are built-in and cannot be modified.'
                      : 'User-defined agents can be fully customized.'}
                  </p>
                </div>
              </div>
            </TabsContent>

            {/* Capabilities Tab */}
            <TabsContent value="capabilities" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Agent Capability</CardTitle>
                  <CardDescription>
                    Define what this agent can do and what tools it can use.
                  </CardDescription>
                </CardHeader>

                <CardContent className="pb-2">
                  <div>
                    <Label>Select Tools</Label>
                    <div className="mt-2 flex flex-wrap gap-2 max-h-48 overflow-y-auto p-2 border rounded-md">
                      {isLoadingTools ? (
                        <div className="w-full text-center py-4 text-muted-foreground">
                          <p className="text-sm">Loading available tools...</p>
                        </div>
                      ) : toolsError ? (
                        <div className="w-full text-center py-4 text-muted-foreground">
                          <p className="text-sm text-red-500">Failed to load tools</p>
                          <p className="text-xs mt-1">{toolsError}</p>
                        </div>
                      ) : allTools.length === 0 ? (
                        <div className="w-full text-center py-4 text-muted-foreground">
                          <p className="text-sm">No tools available.</p>
                        </div>
                      ) : (
                        allTools.map((tool) => {
                          const isSelected = agent.capabilities[0]?.tools.includes(tool) || false
                          return (
                            <Badge
                              key={tool}
                              variant={isSelected ? 'default' : 'outline'}
                              className="cursor-pointer"
                              onClick={() => toggleToolSelection(tool)}
                            >
                              {tool}
                            </Badge>
                          )
                        })
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Prompts Tab */}
            <TabsContent value="prompts" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Prompt Modules</CardTitle>
                  <CardDescription>
                    Configure the prompt modules that define this agent&apos;s behavior.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Label htmlFor="agentPrompt" className="flex items-center gap-1 mb-2">
                    Agent Prompt <span className="text-red-500">*</span>
                  </Label>
                  <Textarea
                    id="agentPrompt"
                    value={
                      agent.promptConfig.coreModules.find(
                        (m) => m.moduleId === 'user-defined-prompt'
                      )?.parameters?.content || ''
                    }
                    onChange={(e) => {
                      const updatedModules = [...agent.promptConfig.coreModules]
                      const promptModuleIndex = updatedModules.findIndex(
                        (m) => m.moduleId === 'user-defined-prompt'
                      )

                      if (promptModuleIndex >= 0) {
                        // Update existing module
                        updatedModules[promptModuleIndex] = {
                          ...updatedModules[promptModuleIndex],
                          parameters: { content: e.target.value }
                        }
                      } else {
                        // Add new module
                        updatedModules.push({
                          moduleId: 'user-defined-prompt',
                          parameters: { content: e.target.value }
                        })
                      }

                      updateAgentField('promptConfig', {
                        ...agent.promptConfig,
                        coreModules: updatedModules
                      })
                    }}
                    rows={10}
                    placeholder="You are an expert geospatial analyst with knowledge of GIS, remote sensing, and spatial analysis techniques. Help users analyze geospatial data and create visualizations..."
                    className="font-mono text-sm mb-4"
                    required
                  />

                  <p className="text-sm text-muted-foreground mb-2">Additional prompt modules:</p>

                  <div className="space-y-4">
                    <div>
                      <Label>Core Modules</Label>
                      <div className="mt-1 p-2 border rounded-md min-h-[60px] bg-muted/30">
                        {agent.promptConfig.coreModules.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No core modules assigned</p>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {agent.promptConfig.coreModules.map((module) => (
                              <Badge key={module.moduleId} variant="outline">
                                {module.moduleId}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <Label>Agent Modules</Label>
                      <div className="mt-1 p-2 border rounded-md min-h-[60px] bg-muted/30">
                        {agent.promptConfig.agentModules.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No agent modules assigned</p>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {agent.promptConfig.agentModules.map((module) => (
                              <Badge key={module.moduleId} variant="outline">
                                {module.moduleId}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Model Tab */}
            <TabsContent value="model" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Model Configuration</CardTitle>
                  <CardDescription>
                    Configure the LLM model settings for this agent.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* LLM Provider */}
                  <div className="grid gap-2">
                    <Label htmlFor="provider">Provider</Label>
                    <Select
                      value={agent.modelConfig.provider}
                      onValueChange={(value: LLMProviderType) => {
                        const updatedModelConfig = {
                          ...agent.modelConfig,
                          provider: value,
                          model: '' // Reset model when provider changes
                        }
                        updateAgentField('modelConfig', updatedModelConfig)
                      }}
                    >
                      <SelectTrigger id="provider">
                        <SelectValue placeholder="Select LLM provider" />
                      </SelectTrigger>
                      <SelectContent>
                        {SUPPORTED_LLM_PROVIDERS.map((providerId) => (
                          <SelectItem key={providerId} value={providerId}>
                            <div className="flex items-center gap-2">
                              <div
                                className={`h-5 w-5 rounded-md ${PROVIDER_BACKGROUNDS[providerId]} flex items-center justify-center p-0.5`}
                              >
                                <img
                                  src={PROVIDER_LOGOS[providerId]}
                                  alt={`${providerId} logo`}
                                  className="h-full w-full object-contain"
                                />
                              </div>
                              <span>{getFormattedProviderName(providerId, undefined, false)}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Model Selection */}
                  <div className="grid gap-2">
                    <Label htmlFor="model">Model</Label>
                    <Select
                      value={agent.modelConfig.model}
                      onValueChange={(value: string) => {
                        const updatedModelConfig = {
                          ...agent.modelConfig,
                          model: value
                        }
                        updateAgentField('modelConfig', updatedModelConfig)
                      }}
                      disabled={!agent.modelConfig.provider || availableModels.length === 0}
                    >
                      <SelectTrigger id="model">
                        <SelectValue
                          placeholder={
                            availableModels.length === 0 ? 'No models available' : 'Select model'
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {availableModels.map((modelName) => (
                          <SelectItem key={modelName} value={modelName}>
                            {modelName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-4 pt-2">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="temperature">Temperature</Label>
                        <span className="text-sm font-medium">
                          {getParameterValue('temperature', 0.7)}
                        </span>
                      </div>
                      <Slider
                        id="temperature"
                        min={0}
                        max={1}
                        step={0.01}
                        value={[getParameterValue('temperature', 0.7)]}
                        onValueChange={(value) => updateModelParameter('temperature', value[0])}
                      />
                      <p className="text-xs text-muted-foreground">
                        Controls the randomness of the output. Lower values make the output more
                        deterministic.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="maxOutputTokens">Max Tokens</Label>
                        <span className="text-sm font-medium">
                          {getParameterValue('maxOutputTokens', 2048)}
                        </span>
                      </div>
                      <Slider
                        id="maxOutputTokens"
                        min={256}
                        max={8192}
                        step={256}
                        value={[getParameterValue('maxOutputTokens', 2048)]}
                        onValueChange={(value) => updateModelParameter('maxOutputTokens', value[0])}
                      />
                      <p className="text-xs text-muted-foreground">
                        Maximum number of tokens (words/characters) the model can generate.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </ScrollArea>

        <DialogFooter className="pt-4">
          <div className="flex justify-between w-full">
            <Button type="button" variant="outline" onClick={handleClose} disabled={isSaving}>
              Cancel
            </Button>

            <div className="flex gap-2">
              {activeTab !== 'general' && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const tabs = ['general', 'prompts', 'capabilities', 'model']
                    const currentIndex = tabs.indexOf(activeTab)

                    if (currentIndex > 0) {
                      setActiveTab(tabs[currentIndex - 1])
                    }
                  }}
                  disabled={isSaving}
                >
                  Previous
                </Button>
              )}

              {activeTab !== 'model' ? (
                <Button
                  type="button"
                  onClick={() => {
                    const tabs = ['general', 'prompts', 'capabilities', 'model']
                    const currentIndex = tabs.indexOf(activeTab)

                    // Validate current tab before proceeding
                    if (activeTab === 'general') {
                      if (!agent?.name.trim()) {
                        toast.error('Agent name is required')
                        return
                      }
                      if (!agent?.description.trim()) {
                        toast.error('Agent description is required')
                        return
                      }
                    } else if (activeTab === 'prompts') {
                      const agentPrompt = agent?.promptConfig.coreModules.find(
                        (m) => m.moduleId === 'user-defined-prompt'
                      )?.parameters?.content
                      if (!agentPrompt || !agentPrompt.trim()) {
                        toast.error('Agent prompt is required')
                        return
                      }
                    }

                    if (currentIndex < tabs.length - 1) {
                      setActiveTab(tabs[currentIndex + 1])
                    }
                  }}
                  disabled={isSaving}
                >
                  Next
                </Button>
              ) : (
                <Button onClick={handleSave} disabled={isSaving}>
                  {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Changes
                </Button>
              )}
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default AgentEditorModal
