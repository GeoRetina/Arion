import React from 'react'
import { Bot, Brain, Sparkles, Zap, Workflow, Settings } from 'lucide-react'
// Helper function to conditionally join class names
const cn = (...classes: (string | boolean | undefined)[]) => {
  return classes.filter(Boolean).join(' ')
}
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/**
 * Agent type with associated info for display
 */
export type AgentDisplayInfo = {
  id: string
  name: string
  isActive?: boolean
  type: 'orchestrator' | 'specialized' | 'general'
  capabilities?: string[]
}

/**
 * Props for the AgentIndicator component
 */
interface AgentIndicatorProps {
  agent: AgentDisplayInfo
  className?: string
  size?: 'sm' | 'md' | 'lg'
  showName?: boolean
  onClick?: (agentId: string) => void
}

/**
 * Component for displaying an agent with appropriate icon and status
 */
const AgentIndicator: React.FC<AgentIndicatorProps> = ({
  agent,
  className,
  size = 'md',
  showName = true,
  onClick
}) => {
  // Size mapping for the component
  const sizeClasses = {
    sm: 'h-6 text-xs',
    md: 'h-8 text-sm',
    lg: 'h-10 text-base'
  }
  
  const iconSizes = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5'
  }
  
  // Get appropriate icon based on agent type
  const getAgentIcon = () => {
    switch (agent.type) {
      case 'orchestrator':
        return <Workflow className={iconSizes[size]} />
      case 'specialized':
        return <Brain className={iconSizes[size]} />
      case 'general':
      default:
        return <Bot className={iconSizes[size]} />
    }
  }
  
  // Get color scheme based on agent type
  const getColorScheme = () => {
    if (!agent.isActive) {
      return 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
    }
    
    switch (agent.type) {
      case 'orchestrator':
        return 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800'
      case 'specialized':
        return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
      case 'general':
      default:
        return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800'
    }
  }

  // Content for the tooltip
  const getTooltipContent = () => {
    return (
      <div className="text-sm">
        <p className="font-medium">{agent.name}</p>
        <p className="text-xs capitalize mt-1">Type: {agent.type}</p>
        
        {agent.capabilities && agent.capabilities.length > 0 && (
          <div className="mt-2">
            <p className="text-xs font-medium mb-1">Capabilities:</p>
            <div className="flex flex-wrap gap-1">
              {agent.capabilities.map((capability) => (
                <span 
                  key={capability}
                  className="inline-block px-1.5 py-0.5 text-xs bg-gray-100 dark:bg-gray-800 rounded"
                >
                  {capability}
                </span>
              ))}
            </div>
          </div>
        )}
        
        {agent.isActive && <p className="text-xs mt-2 flex items-center gap-1"><Zap className="h-3 w-3" /> Active</p>}
      </div>
    )
  }

  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        <div 
          className={cn(
            'flex items-center gap-2 px-3 py-1 rounded-full border transition-colors',
            getColorScheme(),
            sizeClasses[size],
            onClick && 'cursor-pointer hover:bg-opacity-80',
            className
          )}
          onClick={() => onClick?.(agent.id)}
        >
          {getAgentIcon()}
          {showName && <span className="font-medium">{agent.name}</span>}
          
          {agent.isActive && (
            <span className="flex-shrink-0 relative">
              <span className="absolute top-0 right-0 block h-2 w-2 rounded-full bg-green-400 dark:bg-green-500"></span>
              <Sparkles className="h-3.5 w-3.5 text-amber-500 animate-pulse" />
            </span>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {getTooltipContent()}
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * Component for displaying a group of agents working together
 */
interface AgentGroupIndicatorProps {
  agents: AgentDisplayInfo[]
  className?: string
  size?: 'sm' | 'md' | 'lg'
  onAgentClick?: (agentId: string) => void
  showActiveOnly?: boolean
}

export const AgentGroupIndicator: React.FC<AgentGroupIndicatorProps> = ({
  agents,
  className,
  size = 'md',
  onAgentClick,
  showActiveOnly = false
}) => {
  // Filter agents based on showActiveOnly prop
  const displayAgents = showActiveOnly ? agents.filter(a => a.isActive) : agents
  
  if (displayAgents.length === 0) return null
  
  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {displayAgents.map((agent) => (
        <AgentIndicator 
          key={agent.id}
          agent={agent}
          size={size}
          showName={true}
          onClick={onAgentClick}
        />
      ))}
    </div>
  )
}

export default AgentIndicator