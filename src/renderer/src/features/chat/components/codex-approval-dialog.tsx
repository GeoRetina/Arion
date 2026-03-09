import { AlertTriangle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import type { CodexApprovalRequest, CodexApprovalScope } from '../../../../../shared/ipc-types'

function describeRequest(request: CodexApprovalRequest): string {
  switch (request.kind) {
    case 'command':
      return 'Codex wants to run a command inside the managed workspace.'
    case 'file-change':
      return 'Codex wants to apply file changes and needs your approval.'
    case 'file-read':
      return 'Codex wants to read a file outside the staged workspace.'
    default:
      return 'Codex needs your approval before it can continue.'
  }
}

export default function CodexApprovalDialog({
  isOpen,
  request,
  isResolving,
  onApprove,
  onDeny
}: {
  isOpen: boolean
  request: CodexApprovalRequest
  isResolving: boolean
  onApprove: (scope: CodexApprovalScope) => void
  onDeny: () => void
}): React.JSX.Element {
  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent className="max-w-lg px-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Codex Approval Required
          </DialogTitle>
          <DialogDescription className="space-y-3 pt-3">
            <div className="rounded-md border border-amber-300/60 bg-amber-50/60 p-3 text-sm text-foreground dark:border-amber-800/40 dark:bg-amber-950/20">
              {describeRequest(request)}
            </div>
            {request.command ? (
              <div className="space-y-1">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Command
                </div>
                <code className="block rounded bg-muted px-3 py-2 text-sm break-all">
                  {request.command}
                </code>
              </div>
            ) : null}
            {request.cwd ? (
              <div className="space-y-1">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Working Directory
                </div>
                <code className="block rounded bg-muted px-3 py-2 text-sm break-all">
                  {request.cwd}
                </code>
              </div>
            ) : null}
            {request.reason ? (
              <div className="space-y-1">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Reason
                </div>
                <div className="rounded bg-muted px-3 py-2 text-sm">{request.reason}</div>
              </div>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" onClick={onDeny} disabled={isResolving}>
            Deny
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onApprove('once')} disabled={isResolving}>
              {isResolving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Allow Once
            </Button>
            <Button onClick={() => onApprove('run')} disabled={isResolving}>
              {isResolving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Allow For Run
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
