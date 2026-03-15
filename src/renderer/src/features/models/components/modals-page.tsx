'use client'

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import OpenAIConfigModal from './openai-config-modal'
import GoogleConfigModal from './google-config-modal'
import AnthropicConfigModal from './anthropic-config-modal'
import VertexConfigModal from './vertex-config-modal'
import OllamaConfigModal from './ollama-config-modal'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog'
import { CheckCircle, Info, Settings2, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

import { Card } from '@/components/ui/card'
import { useLLMStore, LLMProvider } from '@/stores/llm-store'
import AzureConfigModal from './azure-config-modal'
import {
  PROVIDER_LOGOS,
  PROVIDER_LOGO_CLASSES,
  PROVIDER_BACKGROUNDS
} from '@/constants/llm-providers'
import {
  EMBEDDING_PROVIDER_LABELS,
  SUPPORTED_EMBEDDING_PROVIDERS,
  DEFAULT_EMBEDDING_MODEL_BY_PROVIDER
} from '../../../../../shared/embedding-constants'
import type { EmbeddingProviderType } from '../../../../../shared/ipc-types'
import {
  getModelReasoningCapabilities,
  type ReasoningCapabilityOverride
} from '../../../../../shared/utils/model-capabilities'

export default function ModelsPage(): React.JSX.Element {
  // Modal open states
  const [isOpenAIModalOpen, setIsOpenAIModalOpen] = useState(false)
  const [isGoogleModalOpen, setIsGoogleModalOpen] = useState(false)
  const [isAzureModalOpen, setIsAzureModalOpen] = useState(false)
  const [isAnthropicModalOpen, setIsAnthropicModalOpen] = useState(false)
  const [isVertexModalOpen, setIsVertexModalOpen] = useState(false)
  const [isOllamaModalOpen, setIsOllamaModalOpen] = useState(false)

  // Confirmation dialog state
  const [isClearDialogOpen, setIsClearDialogOpen] = useState(false)
  const [providerToClear, setProviderToClear] = useState<NonNullable<LLMProvider> | null>(null)

  // Inline embedding config state
  const [embeddingProvider, setEmbeddingProvider] = useState<EmbeddingProviderType>('openai')
  const [embeddingModel, setEmbeddingModel] = useState(DEFAULT_EMBEDDING_MODEL_BY_PROVIDER.openai)

  // Get states and actions from the store
  const {
    openaiConfig,
    googleConfig,
    azureConfig,
    anthropicConfig,
    vertexConfig,
    ollamaConfig,
    embeddingConfig,
    isConfigured,
    clearProviderConfig,
    setEmbeddingConfig,
    initializeStore,
    isInitialized
  } = useLLMStore()

  // Initialize store on component mount
  useEffect(() => {
    if (!isInitialized) {
      initializeStore()
    }
  }, [isInitialized, initializeStore])

  // Sync local embedding state from store
  useEffect(() => {
    setEmbeddingProvider(embeddingConfig.provider)
    setEmbeddingModel(
      embeddingConfig.model || DEFAULT_EMBEDDING_MODEL_BY_PROVIDER[embeddingConfig.provider]
    )
  }, [embeddingConfig])

  // OpenAI handlers
  const handleOpenAIOpenModal = (): void => setIsOpenAIModalOpen(true)
  const handleOpenAICloseModal = (): void => setIsOpenAIModalOpen(false)

  // Google handlers
  const handleGoogleOpenModal = (): void => setIsGoogleModalOpen(true)
  const handleGoogleCloseModal = (): void => setIsGoogleModalOpen(false)

  // Azure handlers
  const handleAzureOpenModal = (): void => setIsAzureModalOpen(true)
  const handleAzureCloseModal = (): void => setIsAzureModalOpen(false)

  // Anthropic handlers
  const handleAnthropicOpenModal = (): void => setIsAnthropicModalOpen(true)
  const handleAnthropicCloseModal = (): void => setIsAnthropicModalOpen(false)

  // Vertex handlers
  const handleVertexOpenModal = (): void => setIsVertexModalOpen(true)
  const handleVertexCloseModal = (): void => setIsVertexModalOpen(false)

  // Ollama handlers
  const handleOllamaOpenModal = (): void => setIsOllamaModalOpen(true)
  const handleOllamaCloseModal = (): void => setIsOllamaModalOpen(false)

  const handleClearConfiguration = (providerName: NonNullable<LLMProvider>): void => {
    setProviderToClear(providerName)
    setIsClearDialogOpen(true)
  }

  const handleConfirmClear = (): void => {
    if (!providerToClear) return

    // Call the generic clearProviderConfig from the store
    clearProviderConfig(providerToClear)

    // Also, persist this clearing action to the main process via IPC
    // This assumes your settings service in main has methods to set empty/default configs
    switch (providerToClear) {
      case 'openai':
        window.ctg.settings.setOpenAIConfig({ apiKey: '', model: '' })
        break
      case 'google':
        window.ctg.settings.setGoogleConfig({ apiKey: '', model: '' })
        break
      case 'azure':
        window.ctg.settings.setAzureConfig({ apiKey: '', endpoint: '', deploymentName: '' })
        break
      case 'anthropic':
        window.ctg.settings.setAnthropicConfig({ apiKey: '', model: '' })
        break
      case 'vertex':
        window.ctg.settings.setVertexConfig({ apiKey: '', model: '', project: '', location: '' })
        break
      case 'ollama':
        window.ctg.settings.setOllamaConfig({ baseURL: '', model: '' })
        break
    }

    // If the cleared provider was active, set activeProvider to null in main process as well
    if (useLLMStore.getState().activeProvider === null) {
      window.ctg.settings.setActiveLLMProvider(null)
    }
  }

  const createProviderCard = (
    providerName: NonNullable<LLMProvider>,
    title: string,
    description: string,
    config: ProviderCardConfig,
    openModalHandler: () => void
  ): React.JSX.Element => {
    const configured = isConfigured(providerName)
    const modelName = config.model || config.deploymentName
    const azureReasoningStatus = providerName === 'azure' ? getAzureReasoningStatus(config) : null

    return (
      <Card className="overflow-hidden transition-all surface-elevated gap-0 py-0 border-border/60 hover:border-border">
        <div className="flex items-center gap-3 px-4 py-3">
          <div
            className={`h-8 w-8 shrink-0 rounded-lg ${PROVIDER_BACKGROUNDS[providerName]} flex items-center justify-center p-1.5`}
          >
            <img
              src={PROVIDER_LOGOS[providerName]}
              alt={`${title} logo`}
              className={`h-full w-full object-contain ${PROVIDER_LOGO_CLASSES[providerName]}`}
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{title}</span>
            </div>
            <p className="text-xs text-muted-foreground truncate">{description}</p>
          </div>
        </div>

        {configured && modelName ? (
          <div className="px-4 pb-3">
            <Badge variant="secondary" className="font-mono text-xs truncate max-w-full">
              {modelName}
            </Badge>
            {providerName === 'azure' && config.endpoint && (
              <p className="text-xs text-muted-foreground truncate mt-1" title={config.endpoint}>
                {config.endpoint}
              </p>
            )}
            {azureReasoningStatus && (
              <p className="text-xs text-muted-foreground mt-1">{azureReasoningStatus}</p>
            )}
          </div>
        ) : (
          <div className="px-4 pb-3">
            <p className="text-xs text-muted-foreground">Not configured</p>
          </div>
        )}

        <div className="border-t border-border/40 px-4 py-2 flex items-center gap-1">
          {!configured ? (
            <Button onClick={openModalHandler} size="sm" variant="default" className="h-7 text-xs">
              Configure
            </Button>
          ) : (
            <>
              <Button
                onClick={openModalHandler}
                size="sm"
                variant="ghost"
                className="h-7 text-xs gap-1.5"
              >
                <Settings2 className="h-3 w-3" />
                Edit
              </Button>
              <Button
                onClick={() => handleClearConfiguration(providerName)}
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5"
              >
                <Trash2 className="h-3 w-3" />
                Remove
              </Button>
            </>
          )}
        </div>
      </Card>
    )
  }

  const isEmbeddingProviderCredentialsConfigured = (provider: EmbeddingProviderType): boolean => {
    switch (provider) {
      case 'openai':
        return Boolean(openaiConfig.hasApiKey)
      case 'google':
        return Boolean(googleConfig.hasApiKey)
      case 'anthropic':
        return Boolean(anthropicConfig.hasApiKey)
      case 'azure':
        return Boolean(azureConfig.hasApiKey && azureConfig.endpoint)
      case 'vertex':
        return Boolean(vertexConfig.project && vertexConfig.location)
      case 'ollama':
        return Boolean(ollamaConfig.baseURL)
      default:
        return false
    }
  }

  const handleEmbeddingProviderChange = (value: string): void => {
    const nextProvider = value as EmbeddingProviderType
    setEmbeddingProvider(nextProvider)
    setEmbeddingModel(DEFAULT_EMBEDDING_MODEL_BY_PROVIDER[nextProvider])
  }

  const handleSaveEmbeddingConfig = (): void => {
    if (!embeddingModel.trim()) return
    setEmbeddingConfig({
      provider: embeddingProvider,
      model: embeddingModel.trim()
    })
  }

  const hasEmbeddingCredentials = isEmbeddingProviderCredentialsConfigured(embeddingProvider)
  const embeddingProviderLabel = EMBEDDING_PROVIDER_LABELS[embeddingProvider]
  const hasEmbeddingChanges =
    embeddingProvider !== embeddingConfig.provider ||
    embeddingModel.trim() !== (embeddingConfig.model || '')
  const isEmbeddingSaved = Boolean(embeddingConfig.model) && !hasEmbeddingChanges

  return (
    <ScrollArea className="h-full">
      <div className="pt-14 pb-8 px-10 md:px-20">
        <div className="flex flex-col items-start gap-6">
          <div>
            <h1 className="text-3xl font-semibold mb-2">AI Models</h1>
            <p className="text-muted-foreground max-w-2xl">
              Configure your chat and embedding models. Your API keys are securely stored.
            </p>
          </div>

          <Tabs defaultValue="chat-models" className="w-full">
            <TabsList>
              <TabsTrigger value="chat-models">Chat Models</TabsTrigger>
              <TabsTrigger value="embedding">Embedding Model</TabsTrigger>
            </TabsList>

            <TabsContent value="chat-models">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
                {createProviderCard(
                  'openai',
                  'OpenAI',
                  'gpt-series, o-series',
                  openaiConfig,
                  handleOpenAIOpenModal
                )}
                {createProviderCard(
                  'google',
                  'Google',
                  'Gemini Pro, Gemini Flash',
                  googleConfig,
                  handleGoogleOpenModal
                )}
                {createProviderCard(
                  'azure',
                  'Azure OpenAI',
                  'Enterprise OpenAI services',
                  azureConfig,
                  handleAzureOpenModal
                )}
                {createProviderCard(
                  'anthropic',
                  'Anthropic',
                  'Claude Opus, Sonnet, Haiku',
                  anthropicConfig,
                  handleAnthropicOpenModal
                )}
                {createProviderCard(
                  'vertex',
                  'Google Vertex AI',
                  'Gemini and third-party models',
                  vertexConfig,
                  handleVertexOpenModal
                )}
                {createProviderCard(
                  'ollama',
                  'Ollama',
                  'Run local LLMs (gpt-oss, Llama, Mistral, etc)',
                  ollamaConfig,
                  handleOllamaOpenModal
                )}
              </div>
            </TabsContent>

            <TabsContent value="embedding">
              <div className="mt-4">
                <p className="text-sm text-muted-foreground mb-3">
                  Select the provider and model used for Knowledge Base indexing and retrieval.
                </p>
              </div>
              <Card className="max-w-sm surface-elevated gap-0 py-0 overflow-hidden border-border/60">
                {isEmbeddingSaved && (
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500/10 border-b border-border/40">
                    <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    <p className="text-xs text-muted-foreground">
                      Active:{' '}
                      <span className="font-medium text-foreground">
                        {EMBEDDING_PROVIDER_LABELS[embeddingConfig.provider]}
                      </span>
                      {' / '}
                      <Badge variant="secondary" className="font-mono text-xs ml-0.5">
                        {embeddingConfig.model}
                      </Badge>
                    </p>
                  </div>
                )}

                <div className="px-4 py-4 space-y-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="embedding-provider" className="text-xs font-medium">
                      Provider <span className="text-destructive">*</span>
                    </Label>
                    <Select value={embeddingProvider} onValueChange={handleEmbeddingProviderChange}>
                      <SelectTrigger id="embedding-provider" className="h-8 text-sm">
                        <SelectValue placeholder="Select embedding provider" />
                      </SelectTrigger>
                      <SelectContent>
                        {SUPPORTED_EMBEDDING_PROVIDERS.map((p) => (
                          <SelectItem key={p} value={p}>
                            {EMBEDDING_PROVIDER_LABELS[p]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-1.5">
                    <Label htmlFor="embedding-model" className="text-xs font-medium">
                      Model <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="embedding-model"
                      className="h-8 text-sm"
                      value={embeddingModel}
                      onChange={(e) => setEmbeddingModel(e.target.value)}
                      placeholder="Enter embedding model or deployment name"
                    />
                  </div>

                  {!hasEmbeddingCredentials && (
                    <p className="text-xs text-amber-600">
                      {embeddingProviderLabel} credentials are not configured. Go to the{' '}
                      <span className="font-medium">Chat Models</span> tab to set up{' '}
                      {embeddingProviderLabel} first.
                    </p>
                  )}

                  <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                    <Info className="h-3 w-3 mt-0.5 shrink-0" />
                    <p>
                      Arion enforces 1536-dimension embeddings for schema compatibility. Make sure
                      the selected model outputs 1536-dimension vectors.
                    </p>
                  </div>
                </div>

                <div className="border-t border-border/40 px-4 py-2">
                  <Button
                    onClick={handleSaveEmbeddingConfig}
                    disabled={!embeddingModel.trim() || !hasEmbeddingChanges}
                    size="sm"
                    className="h-7 text-xs"
                  >
                    Save Configuration
                  </Button>
                </div>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Configuration Modals */}
      <OpenAIConfigModal isOpen={isOpenAIModalOpen} onClose={handleOpenAICloseModal} />

      <GoogleConfigModal isOpen={isGoogleModalOpen} onClose={handleGoogleCloseModal} />

      <AzureConfigModal isOpen={isAzureModalOpen} onClose={handleAzureCloseModal} />

      <AnthropicConfigModal isOpen={isAnthropicModalOpen} onClose={handleAnthropicCloseModal} />

      <VertexConfigModal isOpen={isVertexModalOpen} onClose={handleVertexCloseModal} />

      <OllamaConfigModal isOpen={isOllamaModalOpen} onClose={handleOllamaCloseModal} />

      {/* Confirmation Dialog for Clearing Configuration */}
      <ConfirmationDialog
        isOpen={isClearDialogOpen}
        onOpenChange={setIsClearDialogOpen}
        title="Clear Configuration"
        description={`Are you sure you want to clear the configuration for ${providerToClear ? providerToClear.charAt(0).toUpperCase() + providerToClear.slice(1) : 'this provider'}? This will remove your API key and model settings.`}
        confirmText="Clear"
        cancelText="Cancel"
        onConfirm={handleConfirmClear}
        variant="destructive"
      />
    </ScrollArea>
  )
}
type ProviderCardConfig = {
  model?: string | null
  deploymentName?: string | null
  endpoint?: string | null
  reasoningCapabilityOverride?: ReasoningCapabilityOverride | null
}

function getAzureReasoningStatus(config: ProviderCardConfig): string | null {
  if (!config.deploymentName) {
    return null
  }

  const capabilities = getModelReasoningCapabilities(
    'azure',
    config.deploymentName,
    config.reasoningCapabilityOverride
  )

  const sourceLabel = capabilities.source === 'manual' ? 'Manual override' : 'Automatic'
  const modelTypeLabel = capabilities.isReasoningModel
    ? 'reasoning deployment'
    : 'standard deployment'

  return `Reasoning detection: ${sourceLabel} (${modelTypeLabel})`
}
