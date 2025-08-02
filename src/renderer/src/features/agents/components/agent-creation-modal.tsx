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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAgentStore } from '@/stores/agent-store'
import { LLMProviderType } from '@/../../shared/ipc-types'
import { Loader2 } from 'lucide-react'
import { useLLMStore } from '@/stores/llm-store'
import { SUPPORTED_LLM_PROVIDERS, getFormattedProviderName, PROVIDER_LOGOS, PROVIDER_BACKGROUNDS, PROVIDER_CONFIG_KEYS } from '@/constants/llm-providers'

interface AgentCreationModalProps {
  isOpen: boolean
  onClose: () => void
}

const AgentCreationModal: React.FC<AgentCreationModalProps> = ({ isOpen, onClose }) => {
  // Access LLM store for provider and model information
  const { openaiConfig, googleConfig, anthropicConfig, azureConfig, vertexConfig, ollamaConfig } = useLLMStore()
  
  // Agent creation state
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [provider, setProvider] = useState<LLMProviderType | ''>('')
  const [model, setModel] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  // Access agent store for creation function
  const { createAgent } = useAgentStore()

  // Reset form state on close
  const handleClose = () => {
    setName('')
    setDescription('')
    setProvider('')
    setModel('')
    setIsSubmitting(false)
    onClose()
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
  }, [provider, openaiConfig, googleConfig, anthropicConfig, azureConfig, vertexConfig, ollamaConfig])

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Validate form
    if (!name.trim()) {
      toast.error('Agent name is required')
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
      // Create a minimal agent definition - we'll update it with more details in the editor
      const newAgent = await createAgent({
        name,
        description: description || `Agent for ${name}`,
        type: 'user-defined',
        capabilities: [
          {
            id: crypto.randomUUID(),
            name: 'Default Capability',
            description: 'Basic agent capability',
            tools: []
          }
        ],
        promptConfig: {
          coreModules: [],
          agentModules: [],
          taskModules: [],
          ruleModules: []
        },
        modelConfig: {
          provider: provider as LLMProviderType,
          model,
          parameters: {
            temperature: 0.7,
            maxTokens: 2048
          }
        },
        toolAccess: [],
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
      console.error('Error creating agent:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create New Agent</DialogTitle>
            <DialogDescription>
              Create a new AI agent. You'll be able to configure capabilities and tools later.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            {/* Agent Name */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                Name
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="col-span-3"
                placeholder="GeoSpatial Analysis Agent"
                autoFocus
              />
            </div>
            
            {/* Agent Description */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="description" className="text-right">
                Description
              </Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="col-span-3"
                placeholder="Specialized agent for geospatial data analysis tasks"
              />
            </div>
            
            {/* LLM Provider */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="provider" className="text-right">
                Provider
              </Label>
              <Select
                value={provider}
                onValueChange={(value: LLMProviderType) => {
                  setProvider(value)
                  setModel('') // Reset model when provider changes
                }}
              >
                <SelectTrigger id="provider" className="col-span-3">
                  <SelectValue placeholder="Select LLM provider" />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_LLM_PROVIDERS.map((providerId) => (
                    <SelectItem key={providerId} value={providerId}>
                      <div className="flex items-center gap-2">
                        <div className={`h-5 w-5 rounded-md ${PROVIDER_BACKGROUNDS[providerId]} flex items-center justify-center p-0.5`}>
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
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="model" className="text-right">
                Model
              </Label>
              <Select
                value={model}
                onValueChange={setModel}
                disabled={!provider || availableModels.length === 0}
              >
                <SelectTrigger id="model" className="col-span-3">
                  <SelectValue placeholder={availableModels.length === 0 ? "No models available" : "Select model"} />
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
          
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Agent
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default AgentCreationModal