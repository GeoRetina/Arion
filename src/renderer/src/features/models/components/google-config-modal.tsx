'use client'

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { KeyRound, Cloud, Info } from 'lucide-react'
import { useLLMStore } from '@/stores/llm-store'

interface GoogleConfigModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function GoogleConfigModal({
  isOpen,
  onClose
}: GoogleConfigModalProps): React.JSX.Element | null {
  const googleConfig = useLLMStore((state) => state.googleConfig)
  const setGoogleConfig = useLLMStore((state) => state.setGoogleConfig)

  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')

  useEffect(() => {
    if (isOpen) {
      setApiKey(googleConfig.apiKey || '')
      setModel(googleConfig.model || '')
    }
    return () => {
      if (!isOpen) {
        setApiKey('')
        setModel('')
      }
    }
  }, [googleConfig, isOpen])

  const handleSave = (): void => {
    if (apiKey.trim() && model.trim()) {
      setGoogleConfig({ apiKey, model })
      // TODO: Persist to main process via IPC
      onClose()
    }
  }

  if (!isOpen) {
    return null
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center">
              <Cloud className="h-4 w-4 text-foreground" />
            </div>
            <DialogTitle className="text-xl">Configure Google</DialogTitle>
          </div>
          <DialogDescription>
            Enter your Google API key and select a Gemini model to use with Arion.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="googleApiKey" className="font-medium">
                API Key <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  <KeyRound className="h-4 w-4" />
                </div>
                <Input
                  id="googleApiKey"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="pl-10"
                  placeholder="AIzaSyxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Your API key is stored securely and never shared.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="googleModel" className="font-medium">
                Model <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <Input
                  id="googleModel"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="e.g., gemini-2.0-flash-exp"
                />
              </div>
              <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                <p>
                  Specify the Google Gemini model you want to use. See the
                  <a
                    href="https://ai.google.dev/models/gemini"
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline ml-1"
                  >
                    Google AI Documentation
                  </a>
                  for available models.
                </p>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex gap-2 justify-end">
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <Button
            type="button"
            onClick={handleSave}
            disabled={!apiKey.trim() || !model.trim()}
            className="px-6"
          >
            Save Configuration
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
