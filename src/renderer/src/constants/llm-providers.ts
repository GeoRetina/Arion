import { LLMProvider } from '@/stores/llm-store'

// Define the list of LLM providers supported by the UI
export const SUPPORTED_LLM_PROVIDERS: NonNullable<LLMProvider>[] = [
  'openai',
  'google',
  'azure',
  'anthropic',
  'vertex', // Added vertex
  'ollama' // Added ollama
]

// Import the SVG logos
import openaiLogo from '@/assets/llm-providers-logos/openai.svg'
import googleLogo from '@/assets/llm-providers-logos/google.svg'
import azureLogo from '@/assets/llm-providers-logos/azure.svg'
import anthropicLogo from '@/assets/llm-providers-logos/anthropic.svg'
import ollamaLogo from '@/assets/llm-providers-logos/ollama.svg'

// Map of provider IDs to their logos
export const PROVIDER_LOGOS: Record<NonNullable<LLMProvider>, string> = {
  openai: openaiLogo,
  google: googleLogo,
  azure: azureLogo,
  anthropic: anthropicLogo,
  vertex: googleLogo, // Using the same Google logo for Vertex AI as requested
  ollama: ollamaLogo
}

// Extra CSS classes for provider logos (e.g. invert dark logos in dark mode)
export const PROVIDER_LOGO_CLASSES: Record<NonNullable<LLMProvider>, string> = {
  openai: '',
  google: '',
  azure: '',
  anthropic: 'dark:invert',
  vertex: '',
  ollama: 'dark:invert'
}

// Provider card background colors
export const PROVIDER_BACKGROUNDS: Record<NonNullable<LLMProvider>, string> = {
  openai: 'bg-muted',
  google: 'bg-muted',
  azure: 'bg-muted',
  anthropic: 'bg-muted',
  vertex: 'bg-muted',
  ollama: 'bg-muted'
}

// Define a generic config type that covers the properties used for naming
export type FormattableProviderConfig = {
  model?: string | null
  deploymentName?: string | null // Specifically for Azure
  // Add any other properties used in name formatting here
}

// Map of provider IDs to their configuration key
export const PROVIDER_CONFIG_KEYS: Record<NonNullable<LLMProvider>, string> = {
  openai: 'model',
  google: 'model',
  azure: 'deploymentName',
  anthropic: 'model',
  vertex: 'model',
  ollama: 'model'
}

export const getFormattedProviderName = (
  providerId: NonNullable<LLMProvider>,
  config: FormattableProviderConfig | undefined,
  isConfigured: boolean
): string => {
  // Default name is the capitalized providerId
  let name = providerId.charAt(0).toUpperCase() + providerId.slice(1)

  if (isConfigured && config) {
    switch (providerId) {
      case 'openai':
        name = `OpenAI${config.model ? ` (${config.model})` : ''}`
        break
      case 'google':
        name = `Google${config.model ? ` (${config.model})` : ''}`
        break
      case 'azure':
        // Azure uses deploymentName for display in this context
        name = `Azure OpenAI${config.deploymentName ? ` (${config.deploymentName})` : ''}`
        break
      case 'anthropic':
        name = `Anthropic${config.model ? ` (${config.model})` : ''}`
        break
      case 'vertex':
        // Vertex AI often uses Google's models
        name = `Vertex AI${config.model ? ` (${config.model})` : ''}`
        break
      case 'ollama':
        name = `Ollama${config.model ? ` (${config.model})` : ''}`
        break
      // No default case needed as 'name' is already initialized
    }
  }
  // If not configured, or no specific details in config, the default name is used.
  return name
}
