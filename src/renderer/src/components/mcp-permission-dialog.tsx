'use client'

import React, { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { AlertTriangle } from 'lucide-react'

interface McpPermissionDialogProps {
  isOpen: boolean
  toolName: string
  serverId: string
  onPermissionResponse: (granted: boolean, rememberChoice: boolean) => void
}

export const McpPermissionDialog: React.FC<McpPermissionDialogProps> = ({
  isOpen,
  toolName,
  serverId,
  onPermissionResponse
}) => {
  const [rememberChoice, setRememberChoice] = useState(false)

  const handleAllow = () => {
    onPermissionResponse(true, rememberChoice)
    setRememberChoice(false) // Reset for next use
  }

  const handleDeny = () => {
    onPermissionResponse(false, rememberChoice)
    setRememberChoice(false) // Reset for next use
  }

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            MCP Tool Permission Required
          </DialogTitle>
          <DialogDescription className="space-y-2">
            <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20 p-3 mt-3">
              <p className="text-sm">
                The AI assistant wants to use the MCP tool{' '}
                <code className="bg-muted px-1 py-0.5 rounded text-xs font-medium">
                  {toolName}
                </code>{' '}
                from an external server.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                This tool can perform actions on your system or access external resources. Take your time to review this request.
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center space-x-2 py-2">
          <Checkbox
            id="remember-choice"
            checked={rememberChoice}
            onCheckedChange={(checked) => setRememberChoice(checked === true)}
          />
          <label
            htmlFor="remember-choice"
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            Don't ask again for this tool in this chat session
          </label>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleDeny}>
            Deny
          </Button>
          <Button onClick={handleAllow}>Allow</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}