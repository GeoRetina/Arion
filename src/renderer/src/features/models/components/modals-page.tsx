'use client'

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import OpenAIConfigModal from './openai-config-modal'
import GoogleConfigModal from './google-config-modal'
import AnthropicConfigModal from './anthropic-config-modal'
import VertexConfigModal from './vertex-config-modal'
import OllamaConfigModal from './ollama-config-modal'
import { ScrollArea } from '@/components/ui/scroll-area'

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { CheckCircle } from 'lucide-react'
import { useLLMStore, LLMProvider } from '@/stores/llm-store'
import AzureConfigModal from './azure-config-modal'
import {
  PROVIDER_LOGOS,
  PROVIDER_BACKGROUNDS,
  PROVIDER_PROGRESS_COLORS
} from '@/constants/llm-providers'

export default function ModelsPage(): React.JSX.Element {
  // Modal open states
  const [isOpenAIModalOpen, setIsOpenAIModalOpen] = useState(false)
  const [isGoogleModalOpen, setIsGoogleModalOpen] = useState(false)
  const [isAzureModalOpen, setIsAzureModalOpen] = useState(false)
  const [isAnthropicModalOpen, setIsAnthropicModalOpen] = useState(false)
  const [isVertexModalOpen, setIsVertexModalOpen] = useState(false)
  const [isOllamaModalOpen, setIsOllamaModalOpen] = useState(false)

  // Get states and actions from the store
  const {
    openaiConfig,
    googleConfig,
    azureConfig,
    anthropicConfig,
    vertexConfig,
    ollamaConfig,
    isConfigured,
    activeProvider,
    setActiveProvider,
    setOpenAIConfig,
    setGoogleConfig,
    setAzureConfig,
    setAnthropicConfig,
    setVertexConfig,
    setOllamaConfig,
    clearProviderConfig,
    initializeStore,
    isInitialized
  } = useLLMStore()

  // Initialize store on component mount
  useEffect(() => {
    if (!isInitialized) {
      initializeStore()
    }
  }, [isInitialized, initializeStore])

  // OpenAI handlers
  const handleOpenAIOpenModal = (): void => setIsOpenAIModalOpen(true)
  const handleOpenAICloseModal = (): void => setIsOpenAIModalOpen(false)
  const handleOpenAISaveConfig = async (config: {
    apiKey: string
    model: string
  }): Promise<void> => {
    try {
      await setOpenAIConfig(config)
    } catch (error) {}
    handleOpenAICloseModal()
  }

  // Google handlers
  const handleGoogleOpenModal = (): void => setIsGoogleModalOpen(true)
  const handleGoogleCloseModal = (): void => setIsGoogleModalOpen(false)
  const handleGoogleSaveConfig = async (config: {
    apiKey: string
    model: string
  }): Promise<void> => {
    try {
      await setGoogleConfig(config)
    } catch (error) {}
    handleGoogleCloseModal()
  }

  // Azure handlers
  const handleAzureOpenModal = (): void => setIsAzureModalOpen(true)
  const handleAzureCloseModal = (): void => setIsAzureModalOpen(false)
  const handleAzureSaveConfig = async (config: {
    apiKey: string
    endpoint: string
    deploymentName: string
  }): Promise<void> => {
    try {
      await setAzureConfig(config)
    } catch (error) {}
    handleAzureCloseModal()
  }

  // Anthropic handlers
  const handleAnthropicOpenModal = (): void => setIsAnthropicModalOpen(true)
  const handleAnthropicCloseModal = (): void => setIsAnthropicModalOpen(false)
  const handleAnthropicSaveConfig = async (config: {
    apiKey: string
    model: string
  }): Promise<void> => {
    try {
      await setAnthropicConfig(config)
    } catch (error) {}
    handleAnthropicCloseModal()
  }

  // Vertex handlers
  const handleVertexOpenModal = (): void => setIsVertexModalOpen(true)
  const handleVertexCloseModal = (): void => setIsVertexModalOpen(false)
  const handleVertexSaveConfig = async (config: {
    apiKey: string
    model: string
    project: string
    location: string
  }): Promise<void> => {
    try {
      await setVertexConfig(config)
    } catch (error) {}
    handleVertexCloseModal()
  }

  // Ollama handlers
  const handleOllamaOpenModal = (): void => setIsOllamaModalOpen(true)
  const handleOllamaCloseModal = (): void => setIsOllamaModalOpen(false)
  const handleOllamaSaveConfig = async (config: {
    baseURL: string
    model: string
  }): Promise<void> => {
    try {
      await setOllamaConfig(config)
    } catch (error) {}
    handleOllamaCloseModal()
  }

  const handleClearConfiguration = (providerName: NonNullable<LLMProvider>): void => {
    const providerFriendlyName = providerName.charAt(0).toUpperCase() + providerName.slice(1)
    const confirmation = window.confirm(
      `Are you sure you want to clear the configuration for ${providerFriendlyName}? This will remove your API key and model settings.`
    )

    if (confirmation) {
      // Call the generic clearProviderConfig from the store
      clearProviderConfig(providerName)

      // Also, persist this clearing action to the main process via IPC
      // This assumes your settings service in main has methods to set empty/default configs
      switch (providerName) {
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
    } else {
    }
  }

  const isOpenAIConfigured = isConfigured('openai')
  const isGoogleConfigured = isConfigured('google')
  const isAzureConfigured = isConfigured('azure')
  const isAnthropicConfigured = isConfigured('anthropic')
  const isVertexConfigured = isConfigured('vertex')
  const isOllamaConfigured = isConfigured('ollama')

  const createProviderCard = (
    providerName: NonNullable<LLMProvider>,
    title: string,
    description: string,
    config: any,
    openModalHandler: () => void
  ) => {
    const configured = isConfigured(providerName)
    const isActive = activeProvider === providerName

    return (
      <Card
        className={`overflow-hidden transition-all hover:shadow-md flex flex-col ${
          configured ? 'border-[var(--chart-5)] ring-1 ring-[var(--chart-5)]' : 'border-border/50'
        }`}
      >
        <CardHeader className="pb-2 pt-4 px-5">
          <div className="flex items-center gap-3">
            <div
              className={`h-10 w-10 rounded-md ${PROVIDER_BACKGROUNDS[providerName]} flex items-center justify-center p-1.5`}
            >
              <img
                src={PROVIDER_LOGOS[providerName]}
                alt={`${title} logo`}
                className="h-full w-full object-contain"
              />
            </div>
            <div>
              <CardTitle className="text-xl flex items-center gap-2">
                {title}
                {isActive && <CheckCircle className="h-5 w-5 text-[var(--chart-5)]/80" />}
              </CardTitle>
              <CardDescription className="text-sm">{description}</CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex-grow px-5 py-3">
          {configured && (config.model || config.deploymentName) ? (
            <div className="text-sm">
              <div className="flex flex-col gap-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Model:</span>
                  <span className="font-medium truncate max-w-[160px]">
                    {config.model || config.deploymentName}
                  </span>
                </div>
                {providerName === 'azure' && config.endpoint && (
                  <p className="text-sm text-muted-foreground truncate" title={config.endpoint}>
                    Endpoint: {config.endpoint.substring(0, 25)}...
                  </p>
                )}
                <div className="h-1.5 w-full bg-muted overflow-hidden rounded-full mt-1">
                  <div className={`h-full ${PROVIDER_PROGRESS_COLORS[providerName]} w-full`} />
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {`Connect to ${title}'s API to use their models.`}
            </p>
          )}
        </CardContent>

        <CardFooter className="pt-2 pb-4 px-5 mt-auto flex flex-col space-y-2">
          {!configured && (
            <Button onClick={openModalHandler} className="w-full" size="default" variant="default">
              Configure
            </Button>
          )}

          {configured && (
            <>
              <div className="flex w-full gap-2">
                <Button
                  onClick={openModalHandler}
                  className="flex-1"
                  size="default"
                  variant="outline"
                >
                  Update
                </Button>
              </div>
              <Button
                onClick={() => handleClearConfiguration(providerName)}
                className="w-full"
                size="default"
                variant="destructive"
              >
                Clear Configuration
              </Button>
            </>
          )}
        </CardFooter>
      </Card>
    )
  }

  return (
    <ScrollArea className="h-full">
      <div className="py-8 px-4 md:px-6">
        <div className="flex flex-col items-start gap-6">
          <div>
            <h1 className="text-3xl font-semibold mb-2">AI Models</h1>
            <p className="text-muted-foreground max-w-2xl">
              Connect Arion to your preferred LLM provider. Your API keys are securely stored.
            </p>
          </div>

          <div className="w-full">
            <h2 className="text-xl font-medium mb-5">Providers</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
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
          </div>
        </div>
      </div>

      {/* Configuration Modals */}
      <OpenAIConfigModal isOpen={isOpenAIModalOpen} onClose={handleOpenAICloseModal} />

      <GoogleConfigModal isOpen={isGoogleModalOpen} onClose={handleGoogleCloseModal} />

      <AzureConfigModal isOpen={isAzureModalOpen} onClose={handleAzureCloseModal} />

      <AnthropicConfigModal isOpen={isAnthropicModalOpen} onClose={handleAnthropicCloseModal} />

      <VertexConfigModal isOpen={isVertexModalOpen} onClose={handleVertexCloseModal} />

      <OllamaConfigModal isOpen={isOllamaModalOpen} onClose={handleOllamaCloseModal} />
    </ScrollArea>
  )
}
