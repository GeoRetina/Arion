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
import {
  AgentDefinition,
  AgentCapability,
  AgentPromptModuleRef
} from '@/../../shared/types/agent-types'
import { useAgentStore } from '@/stores/agent-store'
import { LLMProviderType } from '@/../../shared/ipc-types'
import { Loader2, Plus, Trash } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Slider } from '@/components/ui/slider'
import { Badge } from '@/components/ui/badge'

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
  const { getAgentById, updateAgent } = useAgentStore()

  // Load agent data when modal opens or agentId changes
  useEffect(() => {
    const loadAgent = async () => {
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
  const handleClose = () => {
    onClose()
  }

  // Handle saving agent changes
  const handleSave = async () => {
    if (!agent || !agentId) return

    // Validate required fields
    if (!agent.name.trim()) {
      toast.error('Agent name is required')
      return
    }

    if (!agent.description.trim()) {
      toast.error('Agent description is required')
      return
    }

    // Check if agent prompt is filled
    const agentPrompt = agent.promptConfig.coreModules.find(
      (m) => m.moduleId === 'user-defined-prompt'
    )?.parameters?.content
    if (!agentPrompt || !agentPrompt.trim()) {
      toast.error('Agent prompt is required')
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
  const updateAgentField = (field: keyof AgentDefinition, value: any) => {
    if (!agent) return

    setAgent({
      ...agent,
      [field]: value
    })
  }

  // Handle capability update
  const updateCapabilityField = (field: keyof AgentCapability, value: any) => {
    if (!agent) return

    // Since we only have a single capability now, update just the first one
    if (agent.capabilities.length === 0) {
      // If no capabilities exist, create one
      const newCapability: AgentCapability = {
        id: crypto.randomUUID(),
        name: 'Default Capability',
        description: value,
        tools: []
      }
      updateAgentField('capabilities', [newCapability])
    } else {
      // Update the existing capability
      const updatedCapabilities = [...agent.capabilities]
      updatedCapabilities[0] = {
        ...updatedCapabilities[0],
        [field]: value
      }
      updateAgentField('capabilities', updatedCapabilities)
    }
  }

  // Toggle tool selection for the capability
  const toggleToolSelection = (toolId: string) => {
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
  const updateModelParameter = (parameter: string, value: any) => {
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
  const getParameterValue = (parameter: string, defaultValue: number) => {
    return agent?.modelConfig.parameters?.[parameter] ?? defaultValue
  }

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
      <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Agent: {agent.name}</DialogTitle>
          <DialogDescription>
            Configure the agent's capabilities, prompt, and model settings.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
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
                  {/* Available tools should be loaded from LlmToolService */}
                  <div className="mt-2 flex flex-wrap gap-2 max-h-48 overflow-y-auto p-2 border rounded-md">
                    {[
                      'add_map_feature',
                      'add_georeferenced_image_layer',
                      'create_map_buffer',
                      'list_map_layers',
                      'set_map_view',
                      'display_chart',
                      'query_knowledge_base'
                    ].map((tool) => {
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
                    })}
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
                  Configure the prompt modules that define this agent's behavior.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Label htmlFor="agentPrompt" className="flex items-center gap-1 mb-2">
                  Agent Prompt <span className="text-red-500">*</span>
                </Label>
                <Textarea
                  id="agentPrompt"
                  value={
                    agent.promptConfig.coreModules.find((m) => m.moduleId === 'user-defined-prompt')
                      ?.parameters?.content || ''
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
                <CardDescription>Configure the LLM model settings for this agent.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Provider</Label>
                    <div className="text-sm mt-1 font-medium">{agent.modelConfig.provider}</div>
                  </div>
                  <div>
                    <Label>Model</Label>
                    <div className="text-sm mt-1 font-medium">{agent.modelConfig.model}</div>
                  </div>
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
                      <Label htmlFor="maxTokens">Max Tokens</Label>
                      <span className="text-sm font-medium">
                        {getParameterValue('maxTokens', 2048)}
                      </span>
                    </div>
                    <Slider
                      id="maxTokens"
                      min={256}
                      max={8192}
                      step={256}
                      value={[getParameterValue('maxTokens', 2048)]}
                      onValueChange={(value) => updateModelParameter('maxTokens', value[0])}
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

        <DialogFooter className="pt-4">
          <Button variant="outline" onClick={handleClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default AgentEditorModal
