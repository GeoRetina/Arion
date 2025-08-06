import { streamText, smoothStream, type CoreMessage, type LanguageModel } from 'ai'
import { MAX_LLM_STEPS } from '../constants/llm-constants'
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
  messages: CoreMessage[]
  system?: string
  tools?: Record<string, any>
  maxSteps?: number
  providerId?: string // Add provider ID for reasoning detection
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
          case 'text-delta':
            textResponse += part.textDelta
            break
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
                  args: toolResult.args,
                  result: toolResult.result
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
    const textEncoder = new TextEncoder()

    try {
      const streamTextOptions = this.buildStreamTextOptions(options)
      const result = streamText(streamTextOptions)

      for await (const part of result.fullStream) {
        switch (part.type) {
          case 'text-delta':
            // Stream text back to the renderer
            streamChunks.push(textEncoder.encode(part.textDelta))
            break
          case 'tool-call':
            // Log the tool call attempt (execution is handled internally by SDK via 'execute')
            // Do not push this part to the client directly unless the UI needs to show pending tool calls.
            // The SDK handles sending this back to the LLM with the result.
            break
          case 'error':
            // Handle errors reported by the stream
            // Provide a structured error message back to the client
            streamChunks.push(
              textEncoder.encode(JSON.stringify({ streamError: `LLM stream error: ${part.error}` }))
            )
            // Depending on the error, you might want to stop processing or throw
            // For now, we push the error and let the stream end.
            break
          case 'finish':
            // Log the finish event
            // The onFinish callback handles cleanup.
            break
          // Handle other potential part types if the SDK introduces them
          default:
            break
        }
      }

      return streamChunks
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred'
      // Ensure a structured error is sent back if an exception escapes the stream loop
      streamChunks.push(textEncoder.encode(JSON.stringify({ streamError: errorMessage })))
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
      const reasoningInfo = shouldDisableToolsForReasoningModel(
        options.model?.modelId,
        options.providerId
      )

      const streamTextOptions: Parameters<typeof streamText>[0] = {
        model: options.model,
        messages: options.messages,
        system: options.system || '',
        // Conditionally disable tools for Ollama reasoning models due to schema conversion issues
        ...(options.tools &&
          Object.keys(options.tools).length > 0 &&
          !reasoningInfo.shouldDisableTools && { tools: options.tools }),
        maxSteps: reasoningInfo.isReasoningModel ? 1 : options.maxSteps || MAX_LLM_STEPS,
        toolCallStreaming: true,
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

      // Execute the streamText call and handle stream events in real-time
      let result
      try {
        result = streamText(streamTextOptions)
      } catch (error) {
        callbacks.onError(error instanceof Error ? error : new Error(String(error)))
        callbacks.onComplete()
        return
      }
      
      let fullText = '' // Accumulate text for reasoning extraction
      const textEncoder = new TextEncoder()

      // Use fullStream to handle text-delta events directly with error handling
      try {
        for await (const part of result.fullStream) {
          switch (part.type) {
            case 'text-delta':
              fullText += part.textDelta
              // Format chunk for AI SDK compatibility
              const formattedChunk = `0:${JSON.stringify(part.textDelta)}\n`
              callbacks.onChunk(textEncoder.encode(formattedChunk))
              break
            case 'reasoning':
              // Include reasoning content in the stream
              const reasoningChunk = `0:${JSON.stringify(part.textDelta)}\n`
              callbacks.onChunk(textEncoder.encode(reasoningChunk))
              break
            case 'error':
              // Send error in AI SDK format
              const errorChunk = `3:${JSON.stringify({ error: part.error instanceof Error ? part.error.message : String(part.error) })}\n`
              callbacks.onChunk(textEncoder.encode(errorChunk))
              callbacks.onError(
                part.error instanceof Error ? part.error : new Error(String(part.error))
              )
              return
            case 'finish':
              // Send completion marker for AI SDK
              const finishData = {
                finishReason: part.finishReason,
                usage: part.usage
              }
              const finishChunk = `d:${JSON.stringify(finishData)}\n`
              callbacks.onChunk(textEncoder.encode(finishChunk))
              break
            case 'abort':
              callbacks.onComplete()
              return
            default:
              // Handle other part types as needed
              break
          }
        }
      } catch (streamError) {
        callbacks.onError(
          streamError instanceof Error ? streamError : new Error(String(streamError))
        )
        callbacks.onComplete()
        return
      }

      callbacks.onComplete()
    } catch (error) {
      console.error('[StreamingHandlerService] Error in handleRealTimeStreaming:', error)
      callbacks.onError(
        error instanceof Error ? error : new Error('Unknown error in streaming handler')
      )
      callbacks.onComplete()
    }
  }

  /**
   * Build standard streamText options from the provided parameters
   * @param options Streaming options
   * @returns Parameters for streamText function
   */
  private buildStreamTextOptions(options: StreamingOptions): Parameters<typeof streamText>[0] {
    // Detect reasoning model and determine tool compatibility
    const reasoningInfo = shouldDisableToolsForReasoningModel(
      options.model?.modelId,
      options.providerId
    )

    const streamTextOptions: Parameters<typeof streamText>[0] = {
      model: options.model,
      messages: options.messages,
      system: options.system || '',
      // Conditionally disable tools for Ollama reasoning models
      ...(options.tools &&
        Object.keys(options.tools).length > 0 &&
        !reasoningInfo.shouldDisableTools && { tools: options.tools }),
      maxSteps: reasoningInfo.isReasoningModel ? 1 : options.maxSteps || MAX_LLM_STEPS,
      experimental_transform: smoothStream({}),
      onFinish: async (_event) => {},
      // Add abort signal support
      ...(options.abortSignal && { abortSignal: options.abortSignal })
    }

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
