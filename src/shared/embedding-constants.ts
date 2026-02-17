import type { EmbeddingProviderType } from './ipc-types'

export const SUPPORTED_EMBEDDING_PROVIDERS: readonly EmbeddingProviderType[] = [
  'openai',
  'google',
  'anthropic',
  'vertex',
  'azure',
  'ollama'
] as const

export const DEFAULT_EMBEDDING_PROVIDER: EmbeddingProviderType = 'openai'

export const DEFAULT_EMBEDDING_MODEL_BY_PROVIDER: Record<EmbeddingProviderType, string> = {
  openai: 'text-embedding-3-small',
  google: 'text-embedding-004',
  anthropic: 'custom-embedding-model',
  vertex: 'text-embedding-004',
  azure: 'text-embedding-3-small',
  ollama: 'nomic-embed-text'
}

export const EMBEDDING_PROVIDER_LABELS: Record<EmbeddingProviderType, string> = {
  openai: 'OpenAI',
  google: 'Google',
  anthropic: 'Anthropic',
  vertex: 'Google Vertex AI',
  azure: 'Azure OpenAI',
  ollama: 'Ollama'
}
