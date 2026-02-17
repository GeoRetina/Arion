import React, { useState } from 'react'
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
import { Edit, Trash2, Brain, Server, Settings } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { PROVIDER_LOGOS, PROVIDER_BACKGROUNDS } from '@/constants/llm-providers'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog'

interface AgentCardProps {
  agent: AgentRegistryEntry
  onEdit: (agentId: string) => void
  onDelete: (agentId: string) => void
}

const AgentCard: React.FC<AgentCardProps> = ({ agent, onEdit, onDelete }) => {
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)

  // Generate a background color based on agent type
  const bgColor =
    agent.type === 'system'
      ? 'bg-indigo-500/10 border-indigo-500/20'
      : 'bg-emerald-500/10 border-emerald-500/20'

  // Handle edit button click
  const handleEditClick = (): void => {
    onEdit(agent.id)
  }

  // Handle delete button click with confirmation
  const handleDeleteClick = (): void => {
    setIsDeleteDialogOpen(true)
  }

  const handleConfirmDelete = (): void => {
    onDelete(agent.id)
  }

  return (
    <TooltipProvider>
      <Card className={`overflow-hidden transition-all hover:shadow-md ${bgColor}`}>
        <CardHeader className="pb-2">
          <div className="space-y-1">
            <CardTitle className="text-lg flex items-start flex-col sm:flex-row sm:items-center gap-2">
              <span className="break-words">{agent.name}</span>
              {agent.type === 'system' && (
                <Badge variant="outline" className="flex-shrink-0">
                  System
                </Badge>
              )}
            </CardTitle>
            <CardDescription className="text-sm line-clamp-2">{agent.description}</CardDescription>
          </div>
        </CardHeader>

        <CardContent className="text-sm space-y-3">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <span className="truncate">Model: {agent.model}</span>
          </div>
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <span className="flex-shrink-0">Provider:</span>
            <div className="flex items-center gap-1 min-w-0">
              <div
                className={`h-4 w-4 rounded-md ${PROVIDER_BACKGROUNDS[agent.provider]} flex items-center justify-center p-0.5 flex-shrink-0`}
              >
                <img
                  src={PROVIDER_LOGOS[agent.provider]}
                  alt={`${agent.provider} logo`}
                  className="h-full w-full object-contain"
                />
              </div>
              <span className="truncate">
                {agent.provider.charAt(0).toUpperCase() + agent.provider.slice(1)}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <span className="truncate">Capabilities: {agent.capabilities.length}</span>
          </div>
        </CardContent>

        <CardFooter className="flex justify-end gap-2 pt-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" onClick={handleEditClick}>
                <Edit className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Edit agent</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                onClick={handleDeleteClick}
                className="text-destructive border-destructive/50 hover:bg-destructive/10 hover:text-destructive hover:border-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Delete agent</p>
            </TooltipContent>
          </Tooltip>
        </CardFooter>
      </Card>

      <ConfirmationDialog
        isOpen={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        title="Delete Agent"
        description={`Are you sure you want to delete agent "${agent.name}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={handleConfirmDelete}
        variant="destructive"
      />
    </TooltipProvider>
  )
}

export default AgentCard
