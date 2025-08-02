import React, { useState } from 'react'
import { Check, ChevronDown, ChevronUp, Brain, Bot, Workflow, Filter } from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Checkbox } from '@/components/ui/checkbox'
// Helper function to conditionally join class names
const cn = (...classes: (string | boolean | undefined)[]) => {
  return classes.filter(Boolean).join(' ')
}

export interface AgentSelectorAgent {
  id: string
  name: string
  type: 'orchestrator' | 'specialized' | 'general'
  description?: string
  capabilities: string[]
  isActive?: boolean
}

interface AgentCapability {
  id: string
  name: string
  description: string
  agents: string[]
}

interface AgentSelectorProps {
  agents: AgentSelectorAgent[]
  capabilities?: AgentCapability[]
  selectedAgentId: string | null
  onAgentSelect: (agentId: string) => void
  disabled?: boolean
  className?: string
  size?: 'sm' | 'md' | 'lg'
  enableOrchestration?: boolean
}

const AgentSelector: React.FC<AgentSelectorProps> = ({
  agents,
  capabilities = [],
  selectedAgentId,
  onAgentSelect,
  disabled = false,
  className,
  size = 'md',
  enableOrchestration = true
}) => {
  const [open, setOpen] = useState(false)
  const [selectedCapabilities, setSelectedCapabilities] = useState<string[]>([])
  
  const sizeClasses = {
    sm: 'h-7 text-xs px-2',
    md: 'h-9 text-sm px-3',
    lg: 'h-11 text-base px-4'
  }

  const selectedAgent = agents.find(agent => agent.id === selectedAgentId) || null

  // Filter agents by selected capabilities
  const filteredAgents = selectedCapabilities.length > 0
    ? agents.filter(agent => {
        const agentCapabilities = capabilities
          .filter(cap => cap.agents.includes(agent.id))
          .map(cap => cap.id)
        
        return selectedCapabilities.every(capId => agentCapabilities.includes(capId))
      })
    : agents

  // Group agents by type
  const orchestratorAgents = enableOrchestration 
    ? filteredAgents.filter(agent => agent.type === 'orchestrator')
    : []
  
  const specializedAgents = filteredAgents.filter(agent => agent.type === 'specialized')
  const generalAgents = filteredAgents.filter(agent => agent.type === 'general')

  // Get the icon for agent type
  const getAgentTypeIcon = (type: AgentSelectorAgent['type']) => {
    switch (type) {
      case 'orchestrator':
        return <Workflow className="h-4 w-4 text-purple-500" />
      case 'specialized':
        return <Brain className="h-4 w-4 text-blue-500" />
      case 'general':
      default:
        return <Bot className="h-4 w-4 text-green-500" />
    }
  }

  // Handle capability selection
  const toggleCapability = (capabilityId: string) => {
    setSelectedCapabilities(prev => 
      prev.includes(capabilityId)
        ? prev.filter(id => id !== capabilityId)
        : [...prev, capabilityId]
    )
  }

  // Clear all selected capabilities
  const clearCapabilityFilter = () => {
    setSelectedCapabilities([])
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'flex items-center justify-between gap-1 font-normal',
            sizeClasses[size],
            selectedAgentId ? 'border-blue-300 dark:border-blue-700' : '',
            className
          )}
          onClick={() => setOpen(!open)}
        >
          {selectedAgent ? (
            <div className="flex items-center gap-2 max-w-40 overflow-hidden">
              {getAgentTypeIcon(selectedAgent.type)}
              <span className="truncate">{selectedAgent.name}</span>
            </div>
          ) : (
            <span className="text-muted-foreground">Select an agent...</span>
          )}
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search agents..." />
          
          {capabilities.length > 0 && (
            <div className="border-b border-border p-2">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center text-sm text-muted-foreground">
                  <Filter className="h-3 w-3 mr-1" />
                  <span>Filter by capability</span>
                </div>
                
                {selectedCapabilities.length > 0 && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-6 text-xs" 
                    onClick={clearCapabilityFilter}
                  >
                    Clear filters
                  </Button>
                )}
              </div>
              
              <ScrollArea className="h-24">
                <div className="space-y-1 px-1">
                  {capabilities.map(capability => (
                    <div 
                      key={capability.id} 
                      className="flex items-center space-x-2 text-sm"
                    >
                      <Checkbox 
                        id={`cap-${capability.id}`}
                        checked={selectedCapabilities.includes(capability.id)}
                        onCheckedChange={() => toggleCapability(capability.id)}
                      />
                      <label 
                        htmlFor={`cap-${capability.id}`}
                        className="flex-1 cursor-pointer"
                      >
                        {capability.name}
                        <span className="text-xs text-muted-foreground ml-1">
                          ({capability.agents.length})
                        </span>
                      </label>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}
          
          <CommandList>
            {filteredAgents.length === 0 && (
              <CommandEmpty>No matching agents found.</CommandEmpty>
            )}
            
            {/* Orchestrator Agents */}
            {orchestratorAgents.length > 0 && (
              <CommandGroup heading="Orchestrators">
                {orchestratorAgents.map(agent => (
                  <CommandItem
                    key={agent.id}
                    value={agent.name}
                    onSelect={() => {
                      onAgentSelect(agent.id)
                      setOpen(false)
                    }}
                  >
                    <div className="flex items-center gap-2 flex-1 overflow-hidden">
                      <Workflow className="h-4 w-4 text-purple-500" />
                      <span className="truncate">{agent.name}</span>
                    </div>
                    
                    <Check
                      className={cn(
                        "ml-auto h-4 w-4",
                        selectedAgentId === agent.id ? "opacity-100" : "opacity-0"
                      )}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            
            {/* Specialized Agents */}
            {specializedAgents.length > 0 && (
              <CommandGroup heading="Specialized Agents">
                {specializedAgents.map(agent => (
                  <CommandItem
                    key={agent.id}
                    value={agent.name}
                    onSelect={() => {
                      onAgentSelect(agent.id)
                      setOpen(false)
                    }}
                  >
                    <div className="flex items-center gap-2 flex-1 overflow-hidden">
                      <Brain className="h-4 w-4 text-blue-500" />
                      <span className="truncate">{agent.name}</span>
                    </div>
                    
                    {agent.capabilities.length > 0 && (
                      <div className="flex flex-wrap gap-1 max-w-32 overflow-hidden mr-2">
                        {agent.capabilities.slice(0, 1).map(capId => {
                          const cap = capabilities.find(c => c.id === capId)
                          return cap ? (
                            <Badge 
                              key={capId}
                              variant="outline" 
                              className="px-1 py-0 text-[10px]"
                            >
                              {cap.name}
                            </Badge>
                          ) : null
                        })}
                        {agent.capabilities.length > 1 && (
                          <Badge 
                            variant="outline" 
                            className="px-1 py-0 text-[10px]"
                          >
                            +{agent.capabilities.length - 1}
                          </Badge>
                        )}
                      </div>
                    )}
                    
                    <Check
                      className={cn(
                        "ml-auto h-4 w-4",
                        selectedAgentId === agent.id ? "opacity-100" : "opacity-0"
                      )}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            
            {/* General Agents */}
            {generalAgents.length > 0 && (
              <CommandGroup heading="General Agents">
                {generalAgents.map(agent => (
                  <CommandItem
                    key={agent.id}
                    value={agent.name}
                    onSelect={() => {
                      onAgentSelect(agent.id)
                      setOpen(false)
                    }}
                  >
                    <div className="flex items-center gap-2 flex-1 overflow-hidden">
                      <Bot className="h-4 w-4 text-green-500" />
                      <span className="truncate">{agent.name}</span>
                    </div>
                    
                    <Check
                      className={cn(
                        "ml-auto h-4 w-4",
                        selectedAgentId === agent.id ? "opacity-100" : "opacity-0"
                      )}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

export default AgentSelector