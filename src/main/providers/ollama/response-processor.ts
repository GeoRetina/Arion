import type {
  LanguageModelV3Content,
  LanguageModelV3Usage,
  SharedV3ProviderMetadata
} from '@ai-sdk/provider'
import { generateId } from '@ai-sdk/provider-utils'
import type { OllamaConfig, OllamaResponse } from './types'
import { mapOllamaFinishReason, normalizeToolArguments, serializeToolArguments } from './utils'

type ToolCallContentWithArgs = Extract<LanguageModelV3Content, { type: 'tool-call' }> & {
  args: unknown
}

export class OllamaResponseProcessor {
  constructor(private readonly config: OllamaConfig) {}

  processGenerateResponse(response: OllamaResponse): {
    content: LanguageModelV3Content[]
    finishReason: import('/mnt/e/Coding/open-source/Arion/node_modules/@ai-sdk/provider/dist/index').LanguageModelV3FinishReason
    usage: LanguageModelV3Usage
    providerMetadata: SharedV3ProviderMetadata
  } {
    const content = this.extractContent(response)
    const finishReason = mapOllamaFinishReason(response.done_reason)
    const usage = this.extractUsage(response)
    const providerMetadata: SharedV3ProviderMetadata = { ollama: {} }

    return {
      content,
      finishReason,
      usage,
      providerMetadata
    }
  }

  private extractContent(response: OllamaResponse): LanguageModelV3Content[] {
    const content: LanguageModelV3Content[] = []
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
      } as ToolCallContentWithArgs)
    }

    return content
  }

  private extractUsage(response: OllamaResponse): LanguageModelV3Usage {
    const inputTokens = response.prompt_eval_count ?? undefined
    const outputTokens = response.eval_count ?? undefined
    return {
      inputTokens: {
        total: inputTokens,
        noCache: inputTokens,
        cacheRead: undefined,
        cacheWrite: undefined
      },
      outputTokens: {
        total: outputTokens,
        text: outputTokens,
        reasoning: undefined
      }
    }
  }
}
