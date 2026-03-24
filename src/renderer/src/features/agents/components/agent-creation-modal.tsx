import React, { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
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
import { Bot, Loader2 } from 'lucide-react'
import { useLLMStore } from '@/stores/llm-store'
import type { AgentDefinition } from '@/../../shared/types/agent-types'
import {
  SUPPORTED_LLM_PROVIDERS,
  getFormattedProviderName,
  PROVIDER_LOGOS,
  PROVIDER_BACKGROUNDS,
  PROVIDER_CONFIG_KEYS
} from '@/constants/llm-providers'
import { Badge } from '@/components/ui/badge'
import { Slider } from '@/components/ui/slider'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useAgentTools } from '@/hooks/use-agent-tools'

interface AgentCreationModalProps {
  isOpen: boolean
  onClose: () => void
}

type AgentCapabilityDraft = {
  id: string
  name: string
  description: string
  tools: string[]
}

const createDefaultCapability = (): AgentCapabilityDraft => ({
  id: crypto.randomUUID(),
  name: 'Default Capability',
  description: 'Define what this agent can do',
  tools: []
})

const AgentCreationModal: React.FC<AgentCreationModalProps> = ({ isOpen, onClose }) => {
  const { openaiConfig, googleConfig, anthropicConfig, azureConfig, vertexConfig, ollamaConfig } =
    useLLMStore()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [provider, setProvider] = useState<LLMProviderType | ''>('')
  const [model, setModel] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [capability, setCapability] = useState<AgentCapabilityDraft>(() =>
    createDefaultCapability()
  )

  const [agentPrompt, setAgentPrompt] = useState('')
  const [temperature, setTemperature] = useState(0.7)
  const [maxTokens, setMaxTokens] = useState(2048)

  const { createAgent, agents, getAgentById } = useAgentStore()

  const [fullAgents, setFullAgents] = useState<AgentDefinition[]>([])

  React.useEffect(() => {
    if (isOpen && agents.length > 0) {
      const loadFullAgentDetails = async (): Promise<void> => {
        const fullAgentPromises = agents.map((agent) => getAgentById(agent.id))
        const fullAgentResults = await Promise.all(fullAgentPromises)
        const validAgents = fullAgentResults.filter(
          (agent): agent is AgentDefinition => agent !== null
        )
        setFullAgents(validAgents)
      }
      loadFullAgentDetails()
    }
  }, [isOpen, agents, getAgentById])

  const {
    availableTools,
    isLoading: isLoadingTools,
    error: toolsError
  } = useAgentTools(fullAgents, isOpen)

  const [selectedTools, setSelectedTools] = useState<string[]>([])

  const handleClose = (): void => {
    setName('')
    setDescription('')
    setProvider('')
    setModel('')
    setAgentPrompt('')
    setCapability(createDefaultCapability())
    setSelectedTools([])
    setTemperature(0.7)
    setMaxTokens(2048)
    setIsSubmitting(false)
    onClose()
  }

  const toggleToolSelection = (toolId: string): void => {
    let updatedTools: string[]

    if (selectedTools.includes(toolId)) {
      updatedTools = selectedTools.filter((id) => id !== toolId)
    } else {
      updatedTools = [...selectedTools, toolId]
    }

    setSelectedTools(updatedTools)
    setCapability({
      ...capability,
      tools: updatedTools
    })
  }

  const readModelFromConfig = (config: unknown, configKey: string): string | null => {
    if (!config || typeof config !== 'object') return null
    const modelValue = (config as Record<string, unknown>)[configKey]
    return typeof modelValue === 'string' && modelValue.length > 0 ? modelValue : null
  }

  const availableModels = React.useMemo<string[]>(() => {
    if (!provider) return []

    const configMap: Partial<Record<NonNullable<LLMProviderType>, unknown>> = {
      openai: openaiConfig,
      google: googleConfig,
      anthropic: anthropicConfig,
      azure: azureConfig,
      vertex: vertexConfig,
      ollama: ollamaConfig
    }

    const config = configMap[provider as NonNullable<LLMProviderType>]
    const configKey = PROVIDER_CONFIG_KEYS[provider as NonNullable<LLMProviderType>]
    const modelName = readModelFromConfig(config, configKey)
    return modelName ? [modelName] : []
  }, [
    provider,
    openaiConfig,
    googleConfig,
    anthropicConfig,
    azureConfig,
    vertexConfig,
    ollamaConfig
  ])

  const handleSubmit = async (): Promise<void> => {
    const trimmedName = name.trim()
    const trimmedDescription = description.trim()
    const trimmedAgentPrompt = agentPrompt.trim()

    if (!trimmedName) {
      toast.error('Agent name is required')
      return
    }
    if (!trimmedDescription) {
      toast.error('Agent description is required')
      return
    }
    if (!trimmedAgentPrompt) {
      toast.error('Agent prompt is required')
      return
    }
    if (!provider) {
      toast.error('LLM provider is required')
      return
    }
    if (!model) {
      toast.error('Model is required')
      return
    }

    setIsSubmitting(true)

    try {
      const newAgent = await createAgent({
        name: trimmedName,
        description: trimmedDescription,
        type: 'user-defined',
        role: 'specialist',
        capabilities: [capability],
        promptConfig: {
          coreModules: trimmedAgentPrompt
            ? [
                {
                  moduleId: 'user-defined-prompt',
                  parameters: {
                    content: trimmedAgentPrompt
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
        toolAccess: capability.tools
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
      <DialogContent className="max-w-lg max-h-[85vh] grid grid-rows-[auto_1fr_auto] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            New Agent
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="min-h-0 -mx-6 px-6">
          <div className="space-y-5 pb-2 pr-4">
            {/* Identity */}
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-xs text-muted-foreground">
                  Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="GeoSpatial Analysis Agent"
                  className="text-sm"
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="description" className="text-xs text-muted-foreground">
                  Description <span className="text-red-500">*</span>
                </Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder="Specialized agent for geospatial data analysis tasks"
                  className="text-sm"
                />
              </div>
            </div>

            <div className="border-t border-border/40" />

            {/* Prompt */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">System Prompt</Label>
              <div className="space-y-1.5">
                <Label htmlFor="agentPrompt" className="text-xs text-muted-foreground">
                  Instructions <span className="text-red-500">*</span>
                </Label>
                <Textarea
                  id="agentPrompt"
                  value={agentPrompt}
                  onChange={(e) => setAgentPrompt(e.target.value)}
                  rows={6}
                  placeholder="You are an expert geospatial analyst with knowledge of GIS, remote sensing, and spatial analysis techniques..."
                  className="font-mono text-sm"
                />
              </div>
            </div>

            <div className="border-t border-border/40" />

            {/* Tools */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Tools</Label>
                {selectedTools.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {selectedTools.length} selected
                  </span>
                )}
              </div>
              <div className="rounded-md border border-border/60">
                <ScrollArea className="h-36 p-2.5">
                  <div className="flex flex-wrap gap-1.5">
                    {isLoadingTools ? (
                      <div className="w-full flex items-center justify-center py-6 text-xs text-muted-foreground">
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        Loading tools...
                      </div>
                    ) : toolsError ? (
                      <div className="w-full text-center py-6 text-xs text-red-500">
                        {toolsError}
                      </div>
                    ) : availableTools.length === 0 ? (
                      <div className="w-full text-center py-6 text-xs text-muted-foreground">
                        No tools available for assignment.
                      </div>
                    ) : (
                      availableTools.map((tool) => {
                        const isSelected = selectedTools.includes(tool)
                        return (
                          <Badge
                            key={tool}
                            variant={isSelected ? 'default' : 'outline'}
                            className="cursor-pointer text-xs"
                            onClick={() => toggleToolSelection(tool)}
                          >
                            {tool}
                          </Badge>
                        )
                      })
                    )}
                  </div>
                </ScrollArea>
              </div>
            </div>

            <div className="border-t border-border/40" />

            {/* Model */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Model</Label>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="provider" className="text-xs text-muted-foreground">
                    Provider
                  </Label>
                  <Select
                    value={provider}
                    onValueChange={(value: LLMProviderType) => {
                      setProvider(value)
                      setModel('')
                    }}
                  >
                    <SelectTrigger id="provider" className="text-sm">
                      <SelectValue placeholder="Select provider" />
                    </SelectTrigger>
                    <SelectContent>
                      {SUPPORTED_LLM_PROVIDERS.map((providerId) => (
                        <SelectItem key={providerId} value={providerId}>
                          <div className="flex items-center gap-2">
                            <div
                              className={`h-4 w-4 rounded ${PROVIDER_BACKGROUNDS[providerId]} flex items-center justify-center p-0.5`}
                            >
                              <img
                                src={PROVIDER_LOGOS[providerId]}
                                alt=""
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

                <div className="space-y-1.5">
                  <Label htmlFor="model" className="text-xs text-muted-foreground">
                    Model
                  </Label>
                  <Select
                    value={model}
                    onValueChange={setModel}
                    disabled={!provider || availableModels.length === 0}
                  >
                    <SelectTrigger id="model" className="text-sm">
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
              </div>

              <div className="space-y-3 pt-1">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="temperature" className="text-xs text-muted-foreground">
                      Temperature
                    </Label>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {temperature}
                    </span>
                  </div>
                  <Slider
                    id="temperature"
                    min={0}
                    max={1}
                    step={0.01}
                    value={[temperature]}
                    onValueChange={(value) => setTemperature(value[0])}
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="maxOutputTokens" className="text-xs text-muted-foreground">
                      Max tokens
                    </Label>
                    <span className="text-xs tabular-nums text-muted-foreground">{maxTokens}</span>
                  </div>
                  <Slider
                    id="maxOutputTokens"
                    min={256}
                    max={8192}
                    step={256}
                    value={[maxTokens]}
                    onValueChange={(value) => setMaxTokens(value[0])}
                  />
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Creating...
              </>
            ) : (
              'Create Agent'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default AgentCreationModal
