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
import { HardDrive, Info, Globe } from 'lucide-react'
import { useLLMStore } from '@/stores/llm-store'
import { toast } from 'sonner'

interface OllamaConfigModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function OllamaConfigModal({
  isOpen,
  onClose
}: OllamaConfigModalProps): React.JSX.Element | null {
  const ollamaConfig = useLLMStore((state) => state.ollamaConfig)
  const setOllamaConfig = useLLMStore((state) => state.setOllamaConfig)

  const [baseURL, setBaseURL] = useState('http://localhost:11434')
  const [model, setModel] = useState('')

  useEffect(() => {
    if (isOpen) {
      setBaseURL(ollamaConfig.baseURL || 'http://localhost:11434')
      setModel(ollamaConfig.model || '')
    }
    return () => {
      if (!isOpen) {
        // Reset if needed, or rely on re-fetch when opened if values are always loaded from store
        // setBaseURL('http://localhost:11434')
        // setModel('')
      }
    }
  }, [ollamaConfig, isOpen])

  const handleSave = (): void => {
    if (baseURL.trim() && model.trim()) {
      // Basic URL validation (very simple)
      let validatedBaseURL = baseURL.trim()
      try {
        // Ensure it's a valid URL structure
        new URL(validatedBaseURL)
        // Remove trailing slash if present, as Ollama SDK might add /api itself
        if (validatedBaseURL.endsWith('/')) {
          validatedBaseURL = validatedBaseURL.slice(0, -1)
        }
        // The ollama-ai-provider defaults to adding /api, so we should provide the base
        // e.g. http://localhost:11434
      } catch {
        toast.error('Invalid Base URL format', {
          description: 'Please enter a valid URL (e.g., http://localhost:11434).'
        })
        return
      }

      setOllamaConfig({ baseURL: validatedBaseURL, model })
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
              <HardDrive className="h-4 w-4 text-foreground" />
            </div>
            <DialogTitle className="text-xl">Configure Ollama</DialogTitle>
          </div>
          <DialogDescription>
            Connect to your local Ollama instance. Ensure Ollama is running.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="ollamaBaseURL" className="font-medium">
                Base URL <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  <Globe className="h-4 w-4" />
                </div>
                <Input
                  id="ollamaBaseURL"
                  type="text"
                  value={baseURL}
                  onChange={(e) => setBaseURL(e.target.value)}
                  className="pl-10"
                  placeholder="http://localhost:11434"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                The API endpoint for your Ollama server (e.g., http://localhost:11434). The provider
                will append &apos;/api&apos;.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="ollamaModel" className="font-medium">
                Model Name <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <Input
                  id="ollamaModel"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="e.g., qwen2.5-coder:7b"
                />
              </div>
              <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                <p>
                  The name of the Ollama model you want to use. Ensure the model is pulled in Ollama
                  first. See available models on the
                  <a
                    href="https://ollama.com/library"
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline ml-1"
                  >
                    Ollama Library
                  </a>
                  .
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
