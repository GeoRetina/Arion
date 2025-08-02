import React, { useState, useEffect } from 'react'
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle,
  DialogTabs,
  DialogTab
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { AgentDefinition, AgentCapability, AgentPromptModuleRef } from '@/../../shared/types/agent-types'
import { useAgentStore } from '@/stores/agent-store'
import { LLMProviderType } from '@/../../shared/ipc-types'
import { Loader2, Plus, Trash, Settings } from 'lucide-react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
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
  
  // Handle capability updates
  const updateCapability = (index: number, field: keyof AgentCapability, value: any) => {
    if (!agent) return
    
    const updatedCapabilities = [...agent.capabilities]
    updatedCapabilities[index] = {
      ...updatedCapabilities[index],
      [field]: value
    }
    
    updateAgentField('capabilities', updatedCapabilities)
  }
  
  // Add a new capability
  const addCapability = () => {
    if (!agent) return
    
    const newCapability: AgentCapability = {
      id: crypto.randomUUID(),
      name: 'New Capability',
      description: 'Describe this capability',
      tools: []
    }
    
    updateAgentField('capabilities', [...agent.capabilities, newCapability])
  }
  
  // Remove a capability
  const removeCapability = (index: number) => {
    if (!agent) return
    
    const updatedCapabilities = [...agent.capabilities]
    updatedCapabilities.splice(index, 1)
    
    updateAgentField('capabilities', updatedCapabilities)
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
            <TabsTrigger value="capabilities">Capabilities</TabsTrigger>
            <TabsTrigger value="prompts">Prompts</TabsTrigger>
            <TabsTrigger value="model">Model</TabsTrigger>
          </TabsList>
          
          {/* General Settings Tab */}
          <TabsContent value="general" className="space-y-4">
            <div className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Name</Label>
                <Input 
                  id="name" 
                  value={agent.name} 
                  onChange={(e) => updateAgentField('name', e.target.value)} 
                />
              </div>
              
              <div className="grid gap-2">
                <Label htmlFor="description">Description</Label>
                <Textarea 
                  id="description" 
                  value={agent.description} 
                  onChange={(e) => updateAgentField('description', e.target.value)}
                  rows={3}
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
            {agent.capabilities.map((capability, index) => (
              <Card key={capability.id} className="relative">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <Label htmlFor={`capability-name-${index}`}>Capability Name</Label>
                      <Input 
                        id={`capability-name-${index}`}
                        value={capability.name}
                        onChange={(e) => updateCapability(index, 'name', e.target.value)}
                        className="mt-1"
                      />
                    </div>
                    
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => removeCapability(index)}
                      className="absolute top-2 right-2"
                    >
                      <Trash className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                
                <CardContent className="pb-2 space-y-4">
                  <div>
                    <Label htmlFor={`capability-description-${index}`}>Description</Label>
                    <Textarea 
                      id={`capability-description-${index}`}
                      value={capability.description}
                      onChange={(e) => updateCapability(index, 'description', e.target.value)}
                      className="mt-1"
                      rows={2}
                    />
                  </div>
                  
                  <div>
                    <Label>Tools</Label>
                    <div className="mt-1 p-2 border rounded-md min-h-[60px] bg-muted/30">
                      {capability.tools.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No tools assigned</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {capability.tools.map((tool) => (
                            <Badge key={tool} variant="outline">{tool}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Tool assignment will be implemented in the next version.
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
            
            <Button 
              variant="outline" 
              onClick={addCapability}
              className="w-full"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Capability
            </Button>
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
                <p className="text-sm text-muted-foreground mb-4">
                  Prompt module configuration will be implemented in the next version.
                </p>
                
                <div className="space-y-4">
                  <div>
                    <Label>Core Modules</Label>
                    <div className="mt-1 p-2 border rounded-md min-h-[60px] bg-muted/30">
                      {agent.promptConfig.coreModules.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No core modules assigned</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {agent.promptConfig.coreModules.map((module) => (
                            <Badge key={module.moduleId} variant="outline">{module.moduleId}</Badge>
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
                            <Badge key={module.moduleId} variant="outline">{module.moduleId}</Badge>
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
                      <span className="text-sm font-medium">{getParameterValue('temperature', 0.7)}</span>
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
                      Controls the randomness of the output. Lower values make the output more deterministic.
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="maxTokens">Max Tokens</Label>
                      <span className="text-sm font-medium">{getParameterValue('maxTokens', 2048)}</span>
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