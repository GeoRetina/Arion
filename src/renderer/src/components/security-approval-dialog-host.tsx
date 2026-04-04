import { useEffect, useMemo, useState, type ReactElement } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import type { SecurityApprovalRequest } from '../../../shared/ipc-types'

export function SecurityApprovalDialogHost(): ReactElement | null {
  const [requestQueue, setRequestQueue] = useState<SecurityApprovalRequest[]>([])

  useEffect(() => {
    const approvals = window.ctg?.securityApprovals
    if (!approvals?.onApprovalRequest) {
      return undefined
    }

    return approvals.onApprovalRequest((request) => {
      setRequestQueue((currentQueue) => [...currentQueue, request])
    })
  }, [])

  const currentRequest = useMemo(() => requestQueue[0] ?? null, [requestQueue])

  const resolveRequest = async (requestId: string, approved: boolean): Promise<void> => {
    setRequestQueue((currentQueue) =>
      currentQueue.filter((request) => request.requestId !== requestId)
    )

    try {
      await window.ctg.securityApprovals.respond(requestId, approved)
    } catch (error) {
      console.error('[SecurityApprovalDialogHost] Failed to resolve request', error)
    }
  }

  if (!currentRequest) {
    return null
  }

  return (
    <AlertDialog
      open={true}
      onOpenChange={(open) => {
        if (!open) {
          void resolveRequest(currentRequest.requestId, false)
        }
      }}
    >
      <AlertDialogContent className="max-w-lg px-6">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            {currentRequest.title}
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-3 pt-3">
            <div className="rounded-md border border-amber-300/60 bg-amber-50/60 p-3 text-sm text-foreground dark:border-amber-800/40 dark:bg-amber-950/20">
              {currentRequest.message}
            </div>
            {currentRequest.detail ? (
              <div className="space-y-1">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Details
                </div>
                <div className="rounded-md bg-muted px-3 py-2 text-sm whitespace-pre-wrap break-all text-foreground">
                  {currentRequest.detail}
                </div>
              </div>
            ) : null}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => void resolveRequest(currentRequest.requestId, false)}
          >
            {currentRequest.cancelLabel || 'Cancel'}
          </Button>
          <Button onClick={() => void resolveRequest(currentRequest.requestId, true)}>
            {currentRequest.confirmLabel || 'Allow'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
