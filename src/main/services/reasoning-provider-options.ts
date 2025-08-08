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

/**
 * Applies provider-specific reasoning options into streamText options.
 * Mutates and returns the provided options object to simplify call sites.
 */
export function applyReasoningProviderOptions<T extends Record<string, any>>(
  providerId: string | undefined,
  streamTextOptions: T
): T {
  if (providerId === 'google') {
    const current = (streamTextOptions as any).providerOptions || {}
    const currentGoogle = current.google || {}
    ;(streamTextOptions as any).providerOptions = {
      ...current,
      google: {
        ...currentGoogle,
        thinkingConfig: {
          ...(currentGoogle.thinkingConfig || {}),
          ...DEFAULT_GOOGLE_THINKING
        }
      }
    }
  }

  if (providerId === 'openai') {
    const current = (streamTextOptions as any).providerOptions || {}
    const currentOpenAI = current.openai || {}
    ;(streamTextOptions as any).providerOptions = {
      ...current,
      openai: {
        ...currentOpenAI,
        ...DEFAULT_OPENAI_REASONING
      }
    }
  }

  return streamTextOptions
}
