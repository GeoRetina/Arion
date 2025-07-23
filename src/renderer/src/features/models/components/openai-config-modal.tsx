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
import { KeyRound, Cpu, Info } from 'lucide-react'
import { useLLMStore } from '@/stores/llm-store'

interface OpenAIConfigModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function OpenAIConfigModal({
  isOpen,
  onClose
}: OpenAIConfigModalProps): React.JSX.Element | null {
  const openaiConfig = useLLMStore((state) => state.openaiConfig)
  const setOpenAIConfig = useLLMStore((state) => state.setOpenAIConfig)

  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('gpt-4o')

  useEffect(() => {
    if (isOpen) {
      setApiKey(openaiConfig.apiKey || '')
      setModel(openaiConfig.model || 'gpt-4o')
    }
    return () => {
      if (!isOpen) {
        setApiKey('')
        setModel('gpt-4o')
      }
    }
  }, [openaiConfig, isOpen])

  const handleSave = (): void => {
    if (apiKey.trim() && model.trim()) {
      setOpenAIConfig({ apiKey, model })
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
            <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center">
              <Cpu className="h-4 w-4 text-primary" />
            </div>
            <DialogTitle className="text-xl">Configure OpenAI</DialogTitle>
          </div>
          <DialogDescription>
            Enter your OpenAI API key and select a model to use with Arion.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="apiKey" className="font-medium">
                API Key <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  <KeyRound className="h-4 w-4" />
                </div>
                <Input
                  id="apiKey"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="pl-10"
                  placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Your API key is stored securely and never shared.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="model" className="font-medium">
                Model <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <Input
                  id="model"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="e.g., gpt-4.1, o4-mini"
                />
              </div>
              <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                <p>
                  Specify the OpenAI model you want to use. Common models include gpt-model series,
                  o-model series, etc. Full list available in the
                  <a
                    href="https://platform.openai.com/docs/models"
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline ml-1"
                  >
                    OpenAI Documentation
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
