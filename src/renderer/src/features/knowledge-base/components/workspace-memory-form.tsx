import React, { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import type { UpdateWorkspaceMemoryPayload } from '../../../../../shared/ipc-types'
import type { WorkspaceMemory } from '../stores/knowledge-base-store'

interface WorkspaceMemoryFormProps {
  isOpen: boolean
  onClose: () => void
  memoryToEdit?: WorkspaceMemory
  onSubmit: (payload: UpdateWorkspaceMemoryPayload) => Promise<void>
  isSubmitting?: boolean
}

function formatDetails(details: unknown): string {
  if (details === undefined || details === null) {
    return ''
  }
  if (typeof details === 'string') {
    return details
  }

  try {
    return JSON.stringify(details, null, 2)
  } catch {
    return String(details)
  }
}

function parseDetails(text: string): unknown {
  const trimmed = text.trim()
  if (!trimmed) {
    return undefined
  }

  try {
    return JSON.parse(trimmed)
  } catch {
    return trimmed
  }
}

export function WorkspaceMemoryForm({
  isOpen,
  onClose,
  memoryToEdit,
  onSubmit,
  isSubmitting = false
}: WorkspaceMemoryFormProps): React.JSX.Element {
  const [summary, setSummary] = useState('')
  const [scope, setScope] = useState<'chat' | 'global'>('global')
  const [memoryType, setMemoryType] = useState<'session_outcome' | 'tool_outcome'>(
    'session_outcome'
  )
  const [detailsText, setDetailsText] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!memoryToEdit) {
      setSummary('')
      setScope('global')
      setMemoryType('session_outcome')
      setDetailsText('')
      setError(null)
      return
    }

    setSummary(memoryToEdit.summary)
    setScope(memoryToEdit.scope)
    setMemoryType(memoryToEdit.memoryType)
    setDetailsText(formatDetails(memoryToEdit.details))
    setError(null)
  }, [memoryToEdit, isOpen])

  const handleSubmit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    if (!memoryToEdit) {
      return
    }

    const normalizedSummary = summary.trim()
    if (!normalizedSummary) {
      setError('Summary is required.')
      return
    }

    setError(null)
    await onSubmit({
      id: memoryToEdit.id,
      summary: normalizedSummary,
      scope,
      memoryType,
      details: parseDetails(detailsText)
    })
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isSubmitting) {
          onClose()
        }
      }}
    >
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Edit Workspace Memory</DialogTitle>
          <DialogDescription>Update this memory entry and save your changes.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="memory-summary">Summary</Label>
            <Textarea
              id="memory-summary"
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              placeholder="Short durable memory summary..."
              className="min-h-[96px]"
              disabled={isSubmitting}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Scope</Label>
              <Select
                value={scope}
                onValueChange={(value: 'chat' | 'global') => setScope(value)}
                disabled={isSubmitting}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">Global</SelectItem>
                  <SelectItem value="chat">Chat</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={memoryType}
                onValueChange={(value: 'session_outcome' | 'tool_outcome') => setMemoryType(value)}
                disabled={isSubmitting}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="session_outcome">Session outcome</SelectItem>
                  <SelectItem value="tool_outcome">Tool outcome</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="memory-details">Details (optional)</Label>
            <Textarea
              id="memory-details"
              value={detailsText}
              onChange={(event) => setDetailsText(event.target.value)}
              placeholder='Plain text or JSON, e.g. {"note":"..."}'
              className="min-h-[140px] font-mono text-xs"
              disabled={isSubmitting}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
