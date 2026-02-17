/**
 * Centralized provider-specific reasoning options
 */

export interface ProviderReasoningConfig {
  providerId?: string
  modelId?: string
}

/** Default Google reasoning (thinking) options */
const DEFAULT_GOOGLE_THINKING = {
  thinkingBudget: 1024,
  includeThoughts: true
}

/** Default OpenAI reasoning options (for o3/o4-mini etc.) */
const DEFAULT_OPENAI_REASONING = {
  // Prefer top-level provider options per Vercel AI SDK docs
  reasoningEffort: 'medium' as 'low' | 'medium' | 'high',
  reasoningSummary: 'auto' as 'auto' | 'detailed' | undefined
}

type ProviderOptionsContainer = {
  providerOptions?: Record<string, unknown>
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

/**
 * Applies provider-specific reasoning options into streamText options.
 * Mutates and returns the provided options object to simplify call sites.
 */
export function applyReasoningProviderOptions<T extends Record<string, unknown>>(
  providerId: string | undefined,
  streamTextOptions: T
): T {
  const optionsWithProvider = streamTextOptions as T & ProviderOptionsContainer

  if (providerId === 'google') {
    const current = asRecord(optionsWithProvider.providerOptions) ?? {}
    const currentGoogle = asRecord(current.google) ?? {}
    optionsWithProvider.providerOptions = {
      ...current,
      google: {
        ...currentGoogle,
        thinkingConfig: {
          ...(asRecord(currentGoogle.thinkingConfig) ?? {}),
          ...DEFAULT_GOOGLE_THINKING
        }
      }
    }
  }

  if (providerId === 'openai') {
    const current = asRecord(optionsWithProvider.providerOptions) ?? {}
    const currentOpenAI = asRecord(current.openai) ?? {}
    optionsWithProvider.providerOptions = {
      ...current,
      openai: {
        ...currentOpenAI,
        ...DEFAULT_OPENAI_REASONING
      }
    }
  }

  return streamTextOptions
}
