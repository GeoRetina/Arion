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
import { KeyRound, Shapes, Info, Cloud, MapPin } from 'lucide-react' // Using Shapes as placeholder icon
import { useLLMStore } from '@/stores/llm-store'

interface VertexConfigModalProps {
  isOpen: boolean
  onClose: () => void
  // We don't need onSave here as it's handled internally by ModelsPage
}

export default function VertexConfigModal({
  isOpen,
  onClose
}: VertexConfigModalProps): React.JSX.Element | null {
  const vertexConfig = useLLMStore((state) => state.vertexConfig)
  const setVertexConfig = useLLMStore((state) => state.setVertexConfig)

  const [apiKey, setApiKey] = useState('')
  const [project, setProject] = useState('')
  const [location, setLocation] = useState('')
  const [model, setModel] = useState('')

  useEffect(() => {
    if (isOpen) {
      setApiKey(vertexConfig.apiKey || '')
      setProject(vertexConfig.project || '')
      setLocation(vertexConfig.location || '')
      setModel(vertexConfig.model || '')
    }
    return () => {
      // Resetting state on close might not be desired if user just clicks away
      // Only reset if explicitly needed, or rely on initial state when re-opened.
      // For now, let's keep it simple and reset to ensure fresh state if component unmounts.
      if (!isOpen) {
        setApiKey('')
        setProject('')
        setLocation('')
        setModel('')
      }
    }
  }, [vertexConfig, isOpen])

  const handleSave = (): void => {
    if (apiKey.trim() && project.trim() && location.trim() && model.trim()) {
      // The actual saving to store and IPC call is done in ModelsPage.tsx
      // Here, we'd call a prop like onSave if it were passed, but ModelsPage handles it.
      // For consistency with how ModelsPage is structured, we let it manage the save logic.
      // This modal primarily collects the data.
      // We can call setVertexConfig directly here to update the store, which ModelsPage will then persist.
      setVertexConfig({ apiKey, project, location, model })
      onClose() // Close the modal after attempting to save
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
            <div className="h-8 w-8 rounded-md bg-green-50 flex items-center justify-center">
              <Shapes className="h-4 w-4 text-green-600" />
            </div>
            <DialogTitle className="text-xl">Configure Google Vertex AI</DialogTitle>
          </div>
          <DialogDescription>
            Enter your Google Cloud credentials and model details for Vertex AI.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="vertexApiKey" className="font-medium">
                API Key (or Service Account Key JSON) <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  <KeyRound className="h-4 w-4" />
                </div>
                <Input
                  id="vertexApiKey"
                  type="password" // Keep as password for API keys, or allow text for JSON path
                  value={apiKey} // Store API key or path to service account JSON
                  onChange={(e) => setApiKey(e.target.value)}
                  className="pl-10"
                  placeholder="Your Vertex AI API Key or path to Service Account JSON"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Enter your API Key or the absolute path to your Google Cloud Service Account JSON
                key file. The key/file content will be handled by the main process.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="vertexProject" className="font-medium">
                Project ID <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  <Cloud className="h-4 w-4" />
                </div>
                <Input
                  id="vertexProject"
                  type="text"
                  value={project}
                  onChange={(e) => setProject(e.target.value)}
                  className="pl-10"
                  placeholder="your-gcp-project-id"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Your Google Cloud Project ID where Vertex AI is enabled.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="vertexLocation" className="font-medium">
                Location <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  <MapPin className="h-4 w-4" />
                </div>
                <Input
                  id="vertexLocation"
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="pl-10"
                  placeholder="e.g., us-central1"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                The GCP region for your Vertex AI resources (e.g., us-central1).
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="vertexModel" className="font-medium">
                Model ID <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                {/* Maybe add a Shapes icon here if it fits or another relevant one */}
                <Input
                  id="vertexModel"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="e.g., gemini-2.0-flash-exp"
                />
              </div>
              <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                <p>
                  Specify the Vertex AI model ID. See the
                  <a
                    href="https://cloud.google.com/vertex-ai/docs/generative-ai/learn/models"
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline ml-1"
                  >
                    Vertex AI Model Documentation
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
            disabled={!apiKey.trim() || !project.trim() || !location.trim() || !model.trim()}
            className="px-6"
          >
            Save Configuration
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
