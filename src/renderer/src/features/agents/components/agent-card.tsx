import React, { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { type AgentRegistryEntry } from '@/../../shared/types/agent-types'
import { ChevronDown, Settings2, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  PROVIDER_LOGOS,
  PROVIDER_BACKGROUNDS,
  getFormattedProviderName
} from '@/constants/llm-providers'
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog'

interface AgentCardProps {
  agent: AgentRegistryEntry
  onEdit: (agentId: string) => void
  onDelete: (agentId: string) => void
}

function formatCapabilityLabel(capabilityId: string): string {
  return capabilityId.replace(/[-_]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

const AgentCard: React.FC<AgentCardProps> = ({ agent, onEdit, onDelete }) => {
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isCapabilitiesOpen, setIsCapabilitiesOpen] = useState(false)
  const hasAssignedTools = Array.isArray(agent.toolAccess) && agent.toolAccess.length > 0
  const expandableItems = hasAssignedTools ? (agent.toolAccess ?? []) : agent.capabilities
  const expandableLabel = hasAssignedTools ? 'tool' : 'capability'

  const handleEditClick = (): void => {
    onEdit(agent.id)
  }

  const handleDeleteClick = (): void => {
    setIsDeleteDialogOpen(true)
  }

  const handleConfirmDelete = (): void => {
    onDelete(agent.id)
  }

  return (
    <>
      <Card className="overflow-hidden transition-all surface-elevated gap-0 py-0 border-border/60 hover:border-border">
        <div className="flex items-center gap-3 px-4 py-3">
          <div
            className={`h-8 w-8 shrink-0 rounded-lg ${PROVIDER_BACKGROUNDS[agent.provider]} flex items-center justify-center p-1.5`}
          >
            <img
              src={PROVIDER_LOGOS[agent.provider]}
              alt={`${agent.provider} logo`}
              className="h-full w-full object-contain"
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium truncate">{agent.name}</span>
              {agent.type === 'system' && (
                <Badge variant="outline" className="text-xs shrink-0">
                  System
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate">
              {getFormattedProviderName(agent.provider, undefined, false)}
            </p>
          </div>
        </div>

        <div className="px-4 pb-3">
          <p className="text-xs text-muted-foreground line-clamp-2">{agent.description}</p>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="secondary" className="font-mono text-xs">
              {agent.model}
            </Badge>
            {expandableItems.length > 0 && (
              <button
                type="button"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setIsCapabilitiesOpen(!isCapabilitiesOpen)}
              >
                {expandableItems.length}{' '}
                {expandableItems.length === 1 ? expandableLabel : `${expandableLabel}s`}
                <ChevronDown
                  className={`h-3 w-3 transition-transform ${isCapabilitiesOpen ? 'rotate-180' : ''}`}
                />
              </button>
            )}
          </div>
          {isCapabilitiesOpen && expandableItems.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {expandableItems.map((item) => (
                <Badge key={item} variant="outline" className="text-xs font-normal">
                  {hasAssignedTools ? item : formatCapabilityLabel(item)}
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-border/40 px-4 py-2 flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs gap-1.5"
            onClick={handleEditClick}
          >
            <Settings2 className="h-3 w-3" />
            Edit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5"
            onClick={handleDeleteClick}
          >
            <Trash2 className="h-3 w-3" />
            Delete
          </Button>
        </div>
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
    </>
  )
}

export default AgentCard
