import { streamText, smoothStream, stepCountIs, type ModelMessage, type LanguageModel } from 'ai'
import { MAX_LLM_STEPS } from '../constants/llm-constants'
import { applyReasoningProviderOptions } from './reasoning-provider-options'
import {
  shouldDisableToolsForReasoningModel,
  extractReasoningFromText,
  isToolSchemaError
} from './reasoning-model-detector'

export interface StreamingCallbacks {
  onChunk: (chunk: Uint8Array) => void
  onError: (error: Error) => void
  onComplete: () => void
}

export interface StreamingOptions {
  model: LanguageModel
  messages: ModelMessage[]
  system?: string
  tools?: Record<string, any>
  maxSteps?: number
  providerId?: string // Add provider ID for reasoning detection
  modelId?: string // V5: LanguageModel no longer guarantees a modelId property
  abortSignal?: AbortSignal
}

export interface StructuredExecutionResult {
  textResponse: string
  toolResults: any[]
  success: boolean
  error?: string
}

export class StreamingHandlerService {
  constructor() {}

  /**
   * Execute agent and collect structured result including both text and tool results
   * Used by OrchestrationService to preserve tool results from specialized agents
   */
  async executeWithStructuredResult(options: StreamingOptions): Promise<StructuredExecutionResult> {
    try {
      const streamTextOptions = this.buildStreamTextOptions(options)

      const result = streamText(streamTextOptions)

      let textResponse = ''
      const toolResults: any[] = []

      // Process the full stream to collect both text and tool results
      for await (const part of result.fullStream) {
        switch (part.type) {
          case 'text-delta': {
            const delta = (part as any).text
            textResponse += delta || ''
            break
          }
          case 'tool-call':
            // Store tool call information for potential later use
            break
          case 'error':
            return {
              textResponse: textResponse,
              toolResults: toolResults,
              success: false,
              error: `LLM stream error: ${part.error}`
            }
          case 'finish':
            break
          default:
            break
        }
      }

      // Extract tool results from the completed result after stream finishes
      try {
        const steps = await result.steps
        if (steps && steps.length > 0) {
          for (const step of steps) {
            // Use type assertion since the AI SDK types are complex
            const stepAny = step as any
            if (stepAny.toolResults && stepAny.toolResults.length > 0) {
              for (const toolResult of stepAny.toolResults) {
                toolResults.push({
                  toolCallId: toolResult.toolCallId,
                  toolName: toolResult.toolName,
                  // v5 uses input/output; provide compatibility fields expected by renderer
                  args: toolResult.args ?? toolResult.input,
                  result: toolResult.result ?? toolResult.output
                })
              }
            }
          }
        }
      } catch (error) {}

      // Extract reasoning content if present
      const { content } = extractReasoningFromText(textResponse)

      return {
        textResponse: content || textResponse,
        toolResults,
        success: true
      }
    } catch (error) {
      return {
        textResponse: '',
        toolResults: [],
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error in structured execution'
      }
    }
  }

  /**
   * Handle streaming messages that collect all chunks and return them at once
   * Legacy method for compatibility with existing IPC handlers
   */
  async handleStreamAsChunks(options: StreamingOptions): Promise<Uint8Array[]> {
    const streamChunks: Uint8Array[] = []

    try {
      const streamTextOptions = this.buildStreamTextOptions(options)
      const result = streamText(streamTextOptions)
      const response = result.toUIMessageStreamResponse()
      await this.pipeUiMessageStream(response, (chunk) => streamChunks.push(chunk))

      return streamChunks
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred'
      // Ensure a structured error is sent back if an exception escapes the stream loop
      const textEncoder = new TextEncoder()
      const errorChunk = `data: ${JSON.stringify({ type: 'error', errorText: errorMessage })}\n\n`
      streamChunks.push(textEncoder.encode(errorChunk))
      return streamChunks
    }
  }

  /**
   * Handle real-time streaming that sends chunks as they arrive
   * Uses callbacks to send data immediately as it becomes available
   */
  async handleRealTimeStreaming(
    options: StreamingOptions,
    callbacks: StreamingCallbacks
  ): Promise<void> {
    try {
      // Detect reasoning model and determine tool compatibility
      const reasoningInfo = shouldDisableToolsForReasoningModel(options.modelId, options.providerId)

      let streamTextOptions: Parameters<typeof streamText>[0] = {
        model: options.model,
        messages: options.messages,
        system: options.system || '',

        ...(options.tools &&
          Object.keys(options.tools).length > 0 &&
          !reasoningInfo.shouldDisableTools && { tools: options.tools }),
        stopWhen: stepCountIs(MAX_LLM_STEPS),
        // Add abort signal support
        ...(options.abortSignal && { abortSignal: options.abortSignal }),
        onError: async (errorEvent) => {
          const errorMessage =
            errorEvent.error instanceof Error ? errorEvent.error.message : String(errorEvent.error)

          // If tools cause schema errors, retry without tools
          if (
            isToolSchemaError(errorMessage) &&
            options.tools &&
            Object.keys(options.tools).length > 0
          ) {
            return this.handleRealTimeStreaming({ ...options, tools: undefined }, callbacks)
          }

          callbacks.onError(
            errorEvent.error instanceof Error
              ? errorEvent.error
              : new Error(String(errorEvent.error))
          )
        }
      }

      // Centralized provider-specific reasoning options
      streamTextOptions = applyReasoningProviderOptions(options.providerId, streamTextOptions)

      // Execute the streamText call and handle stream events in real-time
      let result
      try {
        result = streamText(streamTextOptions)
      } catch (error) {
        callbacks.onError(error instanceof Error ? error : new Error(String(error)))
        callbacks.onComplete()
        return
      }
      try {
        const response = result.toUIMessageStreamResponse()
        await this.pipeUiMessageStream(response, (chunk) => callbacks.onChunk(chunk))
        callbacks.onComplete()
      } catch (streamError) {
        callbacks.onError(
          streamError instanceof Error ? streamError : new Error(String(streamError))
        )
        callbacks.onComplete()
      }
    } catch (error) {
      console.error('[StreamingHandlerService] Error in handleRealTimeStreaming:', error)
      callbacks.onError(
        error instanceof Error ? error : new Error('Unknown error in streaming handler')
      )
      callbacks.onComplete()
    }
  }

  private async pipeUiMessageStream(
    response: Response,
    onChunk: (chunk: Uint8Array) => void
  ): Promise<void> {
    if (!response.body) {
      throw new Error('UI message stream response body is empty.')
    }

    const reader = response.body.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        onChunk(value)
      }
    }
  }

  /**
   * Build standard streamText options from the provided parameters
   * @param options Streaming options
   * @returns Parameters for streamText function
   */
  private buildStreamTextOptions(options: StreamingOptions): Parameters<typeof streamText>[0] {
    // Detect reasoning model and determine tool compatibility
    const reasoningInfo = shouldDisableToolsForReasoningModel(options.modelId, options.providerId)

    let streamTextOptions: Parameters<typeof streamText>[0] = {
      model: options.model,
      messages: options.messages,
      system: options.system || '',
      // Conditionally disable tools for Ollama reasoning models
      ...(options.tools &&
        Object.keys(options.tools).length > 0 &&
        !reasoningInfo.shouldDisableTools && { tools: options.tools }),
      stopWhen: stepCountIs(options.maxSteps || MAX_LLM_STEPS),
      experimental_transform: smoothStream({}),
      onFinish: async (_event) => {},
      // Add abort signal support
      ...(options.abortSignal && { abortSignal: options.abortSignal })
    }

    // Centralized provider-specific reasoning options
    streamTextOptions = applyReasoningProviderOptions(options.providerId, streamTextOptions)

    return streamTextOptions
  }

  /**
   * Validate streaming options
   * @param options Options to validate
   * @returns true if options are valid, throws error otherwise
   */
  validateStreamingOptions(options: StreamingOptions): boolean {
    if (!options.model) {
      throw new Error('Model is required for streaming')
    }

    if (!options.messages || options.messages.length === 0) {
      throw new Error('Messages are required for streaming')
    }

    // Additional validation can be added here
    return true
  }

  /**
   * Create error response for streaming failures
   * @param error Error that occurred
   * @returns Formatted error response
   */
  createErrorResponse(error: Error | string): StructuredExecutionResult {
    const errorMessage = error instanceof Error ? error.message : error
    return {
      textResponse: '',
      toolResults: [],
      success: false,
      error: errorMessage
    }
  }
}
