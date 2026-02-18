'use client'

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Cpu, Info } from 'lucide-react'
import { useLLMStore } from '@/stores/llm-store'
import {
  DEFAULT_EMBEDDING_MODEL_BY_PROVIDER,
  EMBEDDING_PROVIDER_LABELS,
  SUPPORTED_EMBEDDING_PROVIDERS
} from '../../../../../shared/embedding-constants'
import type { EmbeddingProviderType } from '../../../../../shared/ipc-types'

interface EmbeddingConfigModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function EmbeddingConfigModal({
  isOpen,
  onClose
}: EmbeddingConfigModalProps): React.JSX.Element | null {
  const embeddingConfig = useLLMStore((state) => state.embeddingConfig)
  const setEmbeddingConfig = useLLMStore((state) => state.setEmbeddingConfig)

  const [provider, setProvider] = useState<EmbeddingProviderType>('openai')
  const [model, setModel] = useState(DEFAULT_EMBEDDING_MODEL_BY_PROVIDER.openai)

  useEffect(() => {
    if (isOpen) {
      setProvider(embeddingConfig.provider)
      setModel(
        embeddingConfig.model || DEFAULT_EMBEDDING_MODEL_BY_PROVIDER[embeddingConfig.provider]
      )
    }
    return () => {
      if (!isOpen) {
        setProvider('openai')
        setModel(DEFAULT_EMBEDDING_MODEL_BY_PROVIDER.openai)
      }
    }
  }, [embeddingConfig, isOpen])

  const handleProviderChange = (value: string): void => {
    const nextProvider = value as EmbeddingProviderType
    setProvider(nextProvider)
    setModel(DEFAULT_EMBEDDING_MODEL_BY_PROVIDER[nextProvider])
  }

  const handleSave = (): void => {
    if (!model.trim()) {
      return
    }

    setEmbeddingConfig({
      provider,
      model: model.trim()
    })
    onClose()
  }

  if (!isOpen) {
    return null
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center">
              <Cpu className="h-4 w-4 text-foreground" />
            </div>
            <DialogTitle className="text-xl">Configure Embedding Model</DialogTitle>
          </div>
          <DialogDescription>
            Select the provider and model used by Knowledge Base indexing and retrieval.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="embedding-provider" className="font-medium">
                Provider <span className="text-destructive">*</span>
              </Label>
              <Select value={provider} onValueChange={handleProviderChange}>
                <SelectTrigger id="embedding-provider">
                  <SelectValue placeholder="Select embedding provider" />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_EMBEDDING_PROVIDERS.map((providerOption) => (
                    <SelectItem key={providerOption} value={providerOption}>
                      {EMBEDDING_PROVIDER_LABELS[providerOption]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="embedding-model" className="font-medium">
                Model <span className="text-destructive">*</span>
              </Label>
              <Input
                id="embedding-model"
                value={model}
                onChange={(event) => setModel(event.target.value)}
                placeholder="Enter embedding model or deployment name"
              />
            </div>

            <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              <p>
                Arion enforces 1536-dimension embeddings for schema compatibility. Configure
                provider credentials in the Providers section for the selected embedding provider.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="flex gap-2 justify-end">
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <Button type="button" onClick={handleSave} disabled={!model.trim()} className="px-6">
            Save Configuration
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
