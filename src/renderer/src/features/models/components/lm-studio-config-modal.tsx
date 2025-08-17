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
import { Monitor, Info, Globe } from 'lucide-react'
import { useLLMStore } from '@/stores/llm-store'

interface LMStudioConfigModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function LMStudioConfigModal({
  isOpen,
  onClose
}: LMStudioConfigModalProps): React.JSX.Element | null {
  const lmStudioConfig = useLLMStore((state) => state.lmStudioConfig)
  const setLMStudioConfig = useLLMStore((state) => state.setLMStudioConfig)

  const [baseURL, setBaseURL] = useState('http://localhost:1234')
  const [model, setModel] = useState('') // Default model

  useEffect(() => {
    if (isOpen) {
      setBaseURL(lmStudioConfig.baseURL || 'http://localhost:1234')
      setModel(lmStudioConfig.model || '')
    }
    return () => {
      if (!isOpen) {
        // Reset if needed, or rely on re-fetch when opened if values are always loaded from store
        // setBaseURL('http://localhost:1234')
        // setModel('')
      }
    }
  }, [lmStudioConfig, isOpen])

  const handleSave = async (): Promise<void> => {
    if (baseURL.trim() && model.trim()) {
      // Basic URL validation (very simple)
      let validatedBaseURL = baseURL.trim()
      try {
        // Ensure it's a valid URL structure
        new URL(validatedBaseURL)
        // Remove trailing slash if present
        if (validatedBaseURL.endsWith('/')) {
          validatedBaseURL = validatedBaseURL.slice(0, -1)
        }
        // LM Studio uses OpenAI-compatible API format
        // e.g. http://localhost:1234
      } catch (e) {
        alert('Invalid Base URL format. Please enter a valid URL (e.g., http://localhost:1234).')
        return
      }

      try {
        await setLMStudioConfig({ baseURL: validatedBaseURL, model })
        onClose()
      } catch (error) {
        console.error('Failed to save LM Studio configuration:', error)
        alert('Failed to save configuration. Please try again.')
      }
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
            <div className="h-8 w-8 rounded-md bg-orange-100 flex items-center justify-center">
              <Monitor className="h-4 w-4 text-orange-600" />
            </div>
            <DialogTitle className="text-xl">Configure LM Studio</DialogTitle>
          </div>
          <DialogDescription>
            Connect to your local LM Studio instance. Ensure LM Studio is running with a loaded
            model.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="lmStudioBaseURL" className="font-medium">
                Base URL <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  <Globe className="h-4 w-4" />
                </div>
                <Input
                  id="lmStudioBaseURL"
                  type="text"
                  value={baseURL}
                  onChange={(e) => setBaseURL(e.target.value)}
                  className="pl-10"
                  placeholder="http://localhost:1234"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                The API endpoint for your LM Studio server (e.g., http://localhost:1234). Uses
                OpenAI-compatible API format.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="lmStudioModel" className="font-medium">
                Model Name <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <Input
                  id="lmStudioModel"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="e.g., llama-3.2-3b-instruct"
                />
              </div>
              <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                <p>
                  The name of the model loaded in LM Studio. You can find the exact model name in LM
                  Studio's interface under the "Chat" tab or in the model dropdown. Make sure the
                  model is fully loaded before using.
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
            disabled={!baseURL.trim() || !model.trim()}
            className="px-6"
          >
            Save Configuration
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
