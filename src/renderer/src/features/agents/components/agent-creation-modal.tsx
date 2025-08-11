import React, { useState } from 'react'
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
import { toast } from 'sonner'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { useAgentStore } from '@/stores/agent-store'
import { LLMProviderType } from '@/../../shared/ipc-types'
import { Loader2 } from 'lucide-react'
import { useLLMStore } from '@/stores/llm-store'
import {
  SUPPORTED_LLM_PROVIDERS,
  getFormattedProviderName,
  PROVIDER_LOGOS,
  PROVIDER_BACKGROUNDS,
  PROVIDER_CONFIG_KEYS
} from '@/constants/llm-providers'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Slider } from '@/components/ui/slider'
import { ScrollArea } from '@/components/ui/scroll-area'

interface AgentCreationModalProps {
  isOpen: boolean
  onClose: () => void
}

const AgentCreationModal: React.FC<AgentCreationModalProps> = ({ isOpen, onClose }) => {
  // Access LLM store for provider and model information
  const { openaiConfig, googleConfig, anthropicConfig, azureConfig, vertexConfig, ollamaConfig } =
    useLLMStore()

  // Agent creation state
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [provider, setProvider] = useState<LLMProviderType | ''>('')
  const [model, setModel] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [activeTab, setActiveTab] = useState('general')

  // Agent capability state - simplified to a single capability
  const [capability, setCapability] = useState<{
    id: string
    name: string
    description: string
    tools: string[]
  }>({
    id: crypto.randomUUID(),
    name: 'Default Capability',
    description: 'Define what this agent can do',
    tools: []
  })

  // Agent prompt state
  const [agentPrompt, setAgentPrompt] = useState('')

  // Model parameters
  const [temperature, setTemperature] = useState(0.7)
  const [maxTokens, setMaxTokens] = useState(2048)

  // Available tools (this would normally be loaded from your LLMToolService)
  const [availableTools] = useState<string[]>([
    'add_map_feature',
    'add_georeferenced_image_layer',
    'create_map_buffer',
    'list_map_layers',
    'set_map_view',
    'display_chart',
    'query_knowledge_base'
  ])

  // Tool selection state for the capability
  const [selectedTools, setSelectedTools] = useState<string[]>([])

  // Access agent store for creation function
  const { createAgent } = useAgentStore()

  // Reset form state on close
  const handleClose = () => {
    setName('')
    setDescription('')
    setProvider('')
    setModel('')
    setAgentPrompt('')
    setCapability({
      id: crypto.randomUUID(),
      name: 'Default Capability',
      description: 'Define what this agent can do',
      tools: []
    })
    setSelectedTools([])
    setTemperature(0.7)
    setMaxTokens(2048)
    setIsSubmitting(false)
    setActiveTab('general')
    onClose()
  }

  // This function is no longer used since we removed the description field
  // but keeping it for potential future use

  // Toggle tool selection
  const toggleToolSelection = (toolId: string) => {
    let updatedTools: string[]

    if (selectedTools.includes(toolId)) {
      updatedTools = selectedTools.filter((id) => id !== toolId)
    } else {
      updatedTools = [...selectedTools, toolId]
    }

    setSelectedTools(updatedTools)

    // Update the capability's tools array
    setCapability({
      ...capability,
      tools: updatedTools
    })
  }

  // Get available models based on selected provider
  const availableModels = React.useMemo(() => {
    if (!provider) return []

    // Map of provider IDs to their config objects
    const configMap: Record<NonNullable<LLMProviderType>, any> = {
      openai: openaiConfig,
      google: googleConfig,
      anthropic: anthropicConfig,
      azure: azureConfig,
      vertex: vertexConfig,
      ollama: ollamaConfig
    }

    const config = configMap[provider as NonNullable<LLMProviderType>]
    const configKey = PROVIDER_CONFIG_KEYS[provider as NonNullable<LLMProviderType>]

    return config && config[configKey] ? [config[configKey]] : []
  }, [
    provider,
    openaiConfig,
    googleConfig,
    anthropicConfig,
    azureConfig,
    vertexConfig,
    ollamaConfig
  ])

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validate all required fields regardless of active tab
    if (!name.trim()) {
      toast.error('Agent name is required')
      setActiveTab('general')
      return
    }

    if (!description.trim()) {
      toast.error('Agent description is required')
      setActiveTab('general')
      return
    }

    if (!agentPrompt.trim()) {
      toast.error('Agent prompt is required')
      setActiveTab('prompts')
      return
    }

    if (!provider) {
      toast.error('LLM provider is required')
      setActiveTab('model')
      return
    }

    if (!model) {
      toast.error('Model is required')
      setActiveTab('model')
      return
    }

    setIsSubmitting(true)

    try {
      // Create agent definition with all the information from the tabs
      const newAgent = await createAgent({
        name,
        description: description || `Agent for ${name}`,
        type: 'user-defined',
        capabilities: [capability], // Single capability
        promptConfig: {
          // Create a simple agent module from the user's prompt text
          coreModules: agentPrompt
            ? [
                {
                  moduleId: 'user-defined-prompt',
                  parameters: {
                    content: agentPrompt
                  }
                }
              ]
            : [],
          agentModules: [],
          taskModules: [],
          ruleModules: []
        },
        modelConfig: {
          provider: provider as LLMProviderType,
          model,
          parameters: {
            temperature,
            maxOutputTokens: maxTokens
          }
        },
        toolAccess: capability.tools // Tools from the single capability
      })

      if (newAgent) {
        toast.success('Agent created successfully')
        handleClose()
      } else {
        toast.error('Failed to create agent')
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      toast.error('Failed to create agent', {
        description: errorMessage
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[700px] max-h-[80vh]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create New Agent</DialogTitle>
            <DialogDescription>
              Configure the agent's capabilities, prompt, and model settings.
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
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="GeoSpatial Analysis Agent"
                      autoFocus
                      required
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="description" className="flex items-center gap-1">
                      Description <span className="text-red-500">*</span>
                    </Label>
                    <Textarea
                      id="description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={3}
                      placeholder="Specialized agent for geospatial data analysis tasks"
                      required
                    />
                  </div>
                </div>
              </TabsContent>

              {/* Capabilities Tab */}
              <TabsContent value="capabilities" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Agent Capability</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Define what this agent can do and what tools it can use.
                    </p>
                  </CardHeader>

                  <CardContent className="pb-2">
                    <div>
                      <Label>Select Tools</Label>
                      <div className="mt-2 flex flex-wrap gap-2 max-h-48 overflow-y-auto p-2 border rounded-md">
                        {availableTools.map((tool) => {
                          const isSelected = selectedTools.includes(tool)
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
                    <CardTitle>Agent Prompt</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Define the agent's personality, behavior, and special instructions.
                    </p>
                  </CardHeader>
                  <CardContent>
                    <Label htmlFor="agentPrompt" className="flex items-center gap-1 mb-2">
                      Agent Prompt <span className="text-red-500">*</span>
                    </Label>
                    <Textarea
                      id="agentPrompt"
                      value={agentPrompt}
                      onChange={(e) => setAgentPrompt(e.target.value)}
                      rows={10}
                      placeholder="You are an expert geospatial analyst with knowledge of GIS, remote sensing, and spatial analysis techniques. Help users analyze geospatial data and create visualizations..."
                      className="font-mono text-sm"
                      required
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Model Tab */}
              <TabsContent value="model" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Model Configuration</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Configure the LLM model settings for this agent.
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* LLM Provider */}
                    <div className="grid gap-2">
                      <Label htmlFor="provider">Provider</Label>
                      <Select
                        value={provider}
                        onValueChange={(value: LLMProviderType) => {
                          setProvider(value)
                          setModel('') // Reset model when provider changes
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
                                <span>
                                  {getFormattedProviderName(providerId, undefined, false)}
                                </span>
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
                        value={model}
                        onValueChange={setModel}
                        disabled={!provider || availableModels.length === 0}
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
                          <span className="text-sm font-medium">{temperature}</span>
                        </div>
                        <Slider
                          id="temperature"
                          min={0}
                          max={1}
                          step={0.01}
                          value={[temperature]}
                          onValueChange={(value) => setTemperature(value[0])}
                        />
                        <p className="text-xs text-muted-foreground">
                          Controls the randomness of the output. Lower values make the output more
                          deterministic.
                        </p>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="maxOutputTokens">Max Tokens</Label>
                          <span className="text-sm font-medium">{maxTokens}</span>
                        </div>
                        <Slider
                          id="maxOutputTokens"
                          min={256}
                          max={8192}
                          step={256}
                          value={[maxTokens]}
                          onValueChange={(value) => setMaxTokens(value[0])}
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
              <Button type="button" variant="outline" onClick={handleClose} disabled={isSubmitting}>
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
                    disabled={isSubmitting}
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
                        if (!name.trim()) {
                          toast.error('Agent name is required')
                          return
                        }
                        if (!description.trim()) {
                          toast.error('Agent description is required')
                          return
                        }
                      } else if (activeTab === 'prompts') {
                        if (!agentPrompt.trim()) {
                          toast.error('Agent prompt is required')
                          return
                        }
                      }

                      if (currentIndex < tabs.length - 1) {
                        setActiveTab(tabs[currentIndex + 1])
                      }
                    }}
                    disabled={isSubmitting}
                  >
                    Next
                  </Button>
                ) : (
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create Agent
                  </Button>
                )}
              </div>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default AgentCreationModal
