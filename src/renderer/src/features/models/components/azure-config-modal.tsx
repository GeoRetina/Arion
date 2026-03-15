'use client'

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
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
import { KeyRound, Server, Globe, Info } from 'lucide-react'
import { useLLMStore } from '@/stores/llm-store'
import type { ReasoningCapabilityOverride } from '../../../../../shared/utils/model-capabilities'

interface AzureConfigModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function AzureConfigModal({
  isOpen,
  onClose
}: AzureConfigModalProps): React.JSX.Element | null {
  const azureConfig = useLLMStore((state) => state.azureConfig)
  const setAzureConfig = useLLMStore((state) => state.setAzureConfig)

  const [apiKey, setApiKey] = useState('')
  const [endpoint, setEndpoint] = useState('')
  const [deploymentName, setDeploymentName] = useState('')
  const [reasoningCapabilityOverride, setReasoningCapabilityOverride] =
    useState<ReasoningCapabilityOverride>('auto')

  useEffect(() => {
    if (isOpen) {
      setApiKey(azureConfig.apiKey || '')
      setEndpoint(azureConfig.endpoint || '')
      setDeploymentName(azureConfig.deploymentName || '')
      setReasoningCapabilityOverride(azureConfig.reasoningCapabilityOverride ?? 'auto')
    }
    return () => {
      if (!isOpen) {
        setApiKey('')
        setEndpoint('')
        setDeploymentName('')
        setReasoningCapabilityOverride('auto')
      }
    }
  }, [azureConfig, isOpen])

  const handleSave = (): void => {
    if (apiKey.trim() && endpoint.trim() && deploymentName.trim()) {
      setAzureConfig({ apiKey, endpoint, deploymentName, reasoningCapabilityOverride })
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
              <Server className="h-4 w-4 text-foreground" />
            </div>
            <DialogTitle className="text-xl">Configure Azure OpenAI</DialogTitle>
          </div>
          <DialogDescription>
            Enter your Azure OpenAI Service credentials to connect to your deployment.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="azureApiKey" className="font-medium">
                API Key <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  <KeyRound className="h-4 w-4" />
                </div>
                <Input
                  id="azureApiKey"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="pl-10"
                  placeholder="Your Azure OpenAI API key"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Your API key is stored securely and never shared.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="azureEndpoint" className="font-medium">
                Endpoint URL <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  <Globe className="h-4 w-4" />
                </div>
                <Input
                  id="azureEndpoint"
                  type="text"
                  value={endpoint}
                  onChange={(e) => setEndpoint(e.target.value)}
                  className="pl-10"
                  placeholder="https://your-resource-name.openai.azure.com"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                The URL of your Azure OpenAI resource.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="azureDeploymentName" className="font-medium">
                Deployment Name <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <Input
                  id="azureDeploymentName"
                  value={deploymentName}
                  onChange={(e) => setDeploymentName(e.target.value)}
                  placeholder="Your model deployment name"
                />
              </div>
              <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                <p>
                  The name of your model deployment in Azure OpenAI Service. Learn more in the
                  <a
                    href="https://learn.microsoft.com/en-us/azure/ai-services/openai/how-to/create-resource"
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline ml-1"
                  >
                    Azure Documentation
                  </a>
                  .
                </p>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="azureReasoningOverride" className="font-medium">
                Reasoning Detection
              </Label>
              <Select
                value={reasoningCapabilityOverride}
                onValueChange={(value) =>
                  setReasoningCapabilityOverride(value as ReasoningCapabilityOverride)
                }
              >
                <SelectTrigger id="azureReasoningOverride">
                  <SelectValue placeholder="Select reasoning detection mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto detect (recommended)</SelectItem>
                  <SelectItem value="reasoning">Reasoning deployment</SelectItem>
                  <SelectItem value="standard">Standard deployment</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                <p>
                  Auto detect uses the deployment name. If your Azure deployment is an alias like
                  <span className="font-mono mx-1">prod-eastus</span>
                  instead of the base model family, switch to a manual override so the chat input
                  can show the correct reasoning controls.
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
            disabled={!apiKey.trim() || !endpoint.trim() || !deploymentName.trim()}
            className="px-6"
          >
            Save Configuration
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
