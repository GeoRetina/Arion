import type {
  InvalidResponseDataError,
  LanguageModelV2CallWarning,
  LanguageModelV2FinishReason,
  LanguageModelV2StreamPart,
  LanguageModelV2Usage
} from '@ai-sdk/provider'
import { generateId, type ParseResult } from '@ai-sdk/provider-utils'
import { z } from 'zod'
import type { OllamaConfig } from './types'
import {
  createToolCallId,
  extractOllamaResponseObjectsFromChunk,
  getResponseMetadata,
  mapOllamaFinishReason,
  normalizeToolArguments,
  serializeToolArguments
} from './utils'
import { baseOllamaResponseSchema } from './types'

export class OllamaStreamProcessor {
  private state = this.createInitialState()

  constructor(private readonly config: OllamaConfig) {}

  createTransformStream(warnings: LanguageModelV2CallWarning[]) {
    return new TransformStream<
      ParseResult<z.infer<typeof baseOllamaResponseSchema>>,
      LanguageModelV2StreamPart
    >({
      start: (controller) => {
        controller.enqueue({ type: 'stream-start', warnings })
      },
      transform: (chunk, controller) => {
        this.processChunk(chunk, controller)
      },
      flush: (controller) => {
        this.finalize(controller)
      }
    })
  }

  private createInitialState() {
    return {
      finishReason: 'unknown' as LanguageModelV2FinishReason,
      usage: {
        inputTokens: undefined,
        outputTokens: undefined,
        totalTokens: undefined,
        reasoningTokens: undefined,
        cachedInputTokens: undefined
      } as LanguageModelV2Usage,
      hasSentMetadata: false,
      hasTextStarted: false,
      hasReasoningStarted: false,
      textId: generateId(),
      reasoningId: generateId()
    }
  }

  private processChunk(
    chunk: ParseResult<z.infer<typeof baseOllamaResponseSchema>>,
    controller: TransformStreamDefaultController<LanguageModelV2StreamPart>
  ) {
    const values = extractOllamaResponseObjectsFromChunk(chunk)
    if (values.length === 0) {
      if (!chunk.success) {
        controller.enqueue({ type: 'error', error: chunk.error })
      }
      return
    }

    for (const value of values) {
      this.processResponseValue(value, controller)
    }
  }

  private processResponseValue(
    value: any,
    controller: TransformStreamDefaultController<LanguageModelV2StreamPart>
  ) {
    if (!this.state.hasSentMetadata) {
      this.state.hasSentMetadata = true
      controller.enqueue({
        type: 'response-metadata',
        ...getResponseMetadata(value)
      })
    }

    this.emitText(value, controller)
    this.emitThinking(value, controller)
    this.emitToolCalls(value, controller)

    if (value.done) {
      this.state.finishReason = mapOllamaFinishReason(value.done_reason)
      const inputTokens = value.prompt_eval_count ?? undefined
      const outputTokens = value.eval_count ?? undefined
      this.state.usage = {
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

  private emitText(
    value: any,
    controller: TransformStreamDefaultController<LanguageModelV2StreamPart>
  ) {
    const delta = value.message.content
    if (delta == null) return

    if (!this.state.hasTextStarted) {
      this.state.hasTextStarted = true
      controller.enqueue({ type: 'text-start', id: this.state.textId })
    }

    controller.enqueue({
      type: 'text-delta',
      id: this.state.textId,
      delta
    })
  }

  private emitThinking(
    value: any,
    controller: TransformStreamDefaultController<LanguageModelV2StreamPart>
  ) {
    const thoughts = value.message.thinking
    if (thoughts == null) return

    if (!this.state.hasReasoningStarted) {
      this.state.hasReasoningStarted = true
      controller.enqueue({ type: 'reasoning-start', id: this.state.reasoningId })
    }

    controller.enqueue({
      type: 'reasoning-delta',
      id: this.state.reasoningId,
      delta: thoughts
    })
  }

  private emitToolCalls(
    value: any,
    controller: TransformStreamDefaultController<LanguageModelV2StreamPart>
  ) {
    for (const toolCall of value.message.tool_calls ?? []) {
      if (!toolCall.function?.name) {
        throw new InvalidResponseDataError({
          data: toolCall,
          message: `Expected 'function.name' to be a string.`
        })
      }

      const args = normalizeToolArguments(toolCall.function.arguments)
      const serialized = serializeToolArguments(args)
      const id = toolCall.id ?? createToolCallId(this.config.generateId)

      controller.enqueue({
        type: 'tool-call',
        toolCallId: id,
        toolName: toolCall.function.name,
        input: serialized,
        args
      } as any)
    }
  }

  private finalize(controller: TransformStreamDefaultController<LanguageModelV2StreamPart>) {
    if (this.state.hasTextStarted) {
      controller.enqueue({ type: 'text-end', id: this.state.textId })
    }

    if (this.state.hasReasoningStarted) {
      controller.enqueue({ type: 'reasoning-end', id: this.state.reasoningId })
    }

    controller.enqueue({
      type: 'finish',
      finishReason: this.state.finishReason,
      usage: this.state.usage,
      providerMetadata: { ollama: {} }
    })

    this.state = this.createInitialState()
  }
}
