import type {
  LanguageModelV2Content,
  LanguageModelV2Usage,
  SharedV2ProviderMetadata
} from '@ai-sdk/provider'
import { generateId } from '@ai-sdk/provider-utils'
import type { OllamaConfig, OllamaResponse } from './types'
import {
  mapOllamaFinishReason,
  normalizeToolArguments,
  serializeToolArguments
} from './utils'

export class OllamaResponseProcessor {
  constructor(private readonly config: OllamaConfig) {}

  processGenerateResponse(response: OllamaResponse) {
    const content = this.extractContent(response)
    const finishReason = mapOllamaFinishReason(response.done_reason)
    const usage = this.extractUsage(response)
    const providerMetadata: SharedV2ProviderMetadata = { ollama: {} }

    return {
      content,
      finishReason,
      usage,
      providerMetadata
    }
  }

  private extractContent(response: OllamaResponse): LanguageModelV2Content[] {
    const content: LanguageModelV2Content[] = []
    const text = response.message.content
    if (text) {
      content.push({ type: 'text', text })
    }

    const thinking = response.message.thinking
    if (thinking) {
      content.push({ type: 'reasoning', text: thinking })
    }

    for (const toolCall of response.message.tool_calls ?? []) {
      const args = normalizeToolArguments(toolCall.function.arguments)
      const serialized = serializeToolArguments(args)
      content.push({
        type: 'tool-call' as const,
        toolCallId: toolCall.id ?? this.config.generateId?.() ?? generateId(),
        toolName: toolCall.function.name,
        input: serialized,
        args
      } as any)
    }

    return content
  }

  private extractUsage(response: OllamaResponse): LanguageModelV2Usage {
    const inputTokens = response.prompt_eval_count ?? undefined
    const outputTokens = response.eval_count ?? undefined
    return {
      inputTokens,
      outputTokens,
      totalTokens:
        typeof inputTokens === 'number' && typeof outputTokens === 'number'
          ? inputTokens + outputTokens
          : undefined,
      reasoningTokens: undefined,
      cachedInputTokens: undefined
    }
  }
}
