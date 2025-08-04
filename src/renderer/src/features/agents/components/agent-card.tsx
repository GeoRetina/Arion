import React from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { type AgentRegistryEntry } from '@/../../shared/types/agent-types'
import { Edit, Trash, ToggleLeft, ToggleRight, Brain, Server, Settings } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { PROVIDER_LOGOS, PROVIDER_BACKGROUNDS } from '@/constants/llm-providers'

interface AgentCardProps {
  agent: AgentRegistryEntry
  onEdit: (agentId: string) => void
  onDelete: (agentId: string) => void
  onToggleEnabled: (agentId: string, enabled: boolean) => void
  enabled?: boolean
}

const AgentCard: React.FC<AgentCardProps> = ({
  agent,
  onEdit,
  onDelete,
  onToggleEnabled,
  enabled = false
}) => {
  // Generate a background color based on agent type
  const bgColor =
    agent.type === 'system'
      ? 'bg-indigo-500/10 border-indigo-500/20'
      : 'bg-emerald-500/10 border-emerald-500/20'

  // Handle enable/disable toggle
  const handleToggleClick = () => {
    onToggleEnabled(agent.id, !enabled)
  }

  // Handle edit button click
  const handleEditClick = () => {
    onEdit(agent.id)
  }

  // Handle delete button click with confirmation
  const handleDeleteClick = () => {
    if (
      window.confirm(
        `Are you sure you want to delete agent "${agent.name}"? This cannot be undone.`
      )
    ) {
      onDelete(agent.id)
    }
  }

  return (
    <Card className={`overflow-hidden transition-all hover:shadow-md ${bgColor}`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              {agent.name}
              {agent.type === 'system' && (
                <Badge variant="outline" className="ml-2">
                  System
                </Badge>
              )}
            </CardTitle>
            <CardDescription className="text-sm">{agent.description}</CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="text-sm space-y-3">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-muted-foreground" />
          <span>Model: {agent.model}</span>
        </div>
        <div className="flex items-center gap-2">
          <Server className="h-4 w-4 text-muted-foreground" />
          <span>Provider: </span>
          <div className="flex items-center gap-1">
            <div
              className={`h-4 w-4 rounded-md ${PROVIDER_BACKGROUNDS[agent.provider]} flex items-center justify-center p-0.5`}
            >
              <img
                src={PROVIDER_LOGOS[agent.provider]}
                alt={`${agent.provider} logo`}
                className="h-full w-full object-contain"
              />
            </div>
            <span>{agent.provider.charAt(0).toUpperCase() + agent.provider.slice(1)}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Settings className="h-4 w-4 text-muted-foreground" />
          <span>Capabilities: {agent.capabilities.length}</span>
        </div>
      </CardContent>

      <CardFooter className="flex justify-between pt-2">
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleEditClick}
            className="flex items-center gap-1"
          >
            <Edit className="h-4 w-4" />
            Edit
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDeleteClick}
            className="flex items-center gap-1"
          >
            <Trash className="h-4 w-4" />
            Delete
          </Button>
        </div>
        <Button
          variant={enabled ? 'outline' : 'default'}
          size="sm"
          onClick={handleToggleClick}
          className="flex items-center gap-1"
        >
          {enabled ? (
            <>
              <ToggleRight className="h-4 w-4" />
              Disable
            </>
          ) : (
            <>
              <ToggleLeft className="h-4 w-4" />
              Enable
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  )
}

export default AgentCard
