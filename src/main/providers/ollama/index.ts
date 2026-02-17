import type { LanguageModelV3, LanguageModelV3CallOptions } from '@ai-sdk/provider'
import {
  combineHeaders,
  createJsonResponseHandler,
  postJsonToApi,
  safeParseJSON,
  type ParseResult,
  type ResponseHandler,
  withoutTrailingSlash
} from '@ai-sdk/provider-utils'
import type { ZodSchema } from 'zod'
import {
  baseOllamaResponseSchema,
  type CreateOllamaOptions,
  type OllamaConfig,
  type OllamaResponse,
  ollamaFailedResponseHandler
} from './types'
import { OllamaRequestBuilder } from './request-builder'
import { OllamaResponseProcessor } from './response-processor'
import { OllamaStreamProcessor } from './stream-processor'

/**
 * Creates a response handler for newline-delimited JSON (NDJSON) streams.
 * Ollama uses NDJSON format for streaming responses.
 */
function createNdjsonStreamResponseHandler<T>(
  schema: ZodSchema<T>
): ResponseHandler<ReadableStream<ParseResult<T>>> {
  return async ({ response }) => {
    if (!response.body) {
      throw new Error('Response body is null')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    const stream = new ReadableStream<ParseResult<T>>({
      async pull(controller) {
        while (true) {
          const { done, value } = await reader.read()

          if (done) {
            // Process any remaining buffer content
            if (buffer.trim()) {
              const result = await safeParseJSON({ schema, text: buffer.trim() })
              controller.enqueue(result)
            }
            controller.close()
            return
          }

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? '' // Keep incomplete line in buffer

          for (const line of lines) {
            if (line.trim()) {
              const result = await safeParseJSON({ schema, text: line })
              controller.enqueue(result)
            }
          }
        }
      },
      cancel() {
        reader.cancel()
      }
    })

    return { value: stream }
  }
}

export function createOllama(options: CreateOllamaOptions) {
  const configuredBase = withoutTrailingSlash(options.baseURL ?? 'http://127.0.0.1:11434')
  const baseURL = configuredBase?.endsWith('/api') ? configuredBase : `${configuredBase}/api`
  const providerName = options.name ?? 'ollama'

  const config: OllamaConfig = {
    provider: `${providerName}.responses`,
    url: ({ path }) => `${baseURL}${path}`,
    headers: () => ({ ...(options.headers ?? {}) }),
    fetch: options.fetch
  }

  return (modelId: string): LanguageModelV3 => {
    return new OllamaResponsesLanguageModel(modelId, config)
  }
}

class OllamaResponsesLanguageModel implements LanguageModelV3 {
  readonly specificationVersion = 'v3' as const
  readonly modelId: string

  private readonly config: OllamaConfig
  private readonly builder = new OllamaRequestBuilder()
  private readonly processor: OllamaResponseProcessor

  constructor(modelId: string, config: OllamaConfig) {
    this.modelId = modelId
    this.config = config
    this.processor = new OllamaResponseProcessor(config)
  }

  get provider(): string {
    return this.config.provider
  }

  readonly supportedUrls: Record<string, RegExp[]> = {
    'image/*': [/^https?:\/\/.*$/]
  }

  async doGenerate(options: LanguageModelV3CallOptions): Promise<{
    warnings: import('/mnt/e/Coding/open-source/Arion/node_modules/@ai-sdk/provider/dist/index').SharedV3Warning[]
    request: { body: string }
    response: {
      modelId: string
      timestamp: Date
      headers: Record<string, string> | undefined
      body: unknown
    }
    content: import('/mnt/e/Coding/open-source/Arion/node_modules/@ai-sdk/provider/dist/index').LanguageModelV3Content[]
    finishReason: import('/mnt/e/Coding/open-source/Arion/node_modules/@ai-sdk/provider/dist/index').LanguageModelV3FinishReason
    usage: import('/mnt/e/Coding/open-source/Arion/node_modules/@ai-sdk/provider/dist/index').LanguageModelV3Usage
    providerMetadata: import('/mnt/e/Coding/open-source/Arion/node_modules/@ai-sdk/provider/dist/index').SharedV3ProviderMetadata
  }> {
    const { args, warnings } = await this.builder.buildRequest({
      ...options,
      modelId: this.modelId
    })

    const {
      responseHeaders,
      value: response,
      rawValue
    } = await postJsonToApi({
      url: this.config.url({ path: '/chat', modelId: this.modelId }),
      headers: combineHeaders(this.config.headers(), options.headers),
      body: { ...args, stream: false },
      failedResponseHandler: ollamaFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(baseOllamaResponseSchema as UnsafeAny),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch
    })

    const processed = this.processor.processGenerateResponse(response as OllamaResponse)

    return {
      ...processed,
      warnings,
      request: { body: JSON.stringify(args) },
      response: {
        modelId: this.modelId,
        timestamp: new Date(),
        headers: responseHeaders,
        body: rawValue
      }
    }
  }

  async doStream(options: LanguageModelV3CallOptions): Promise<{
    stream: ReadableStream<
      import('/mnt/e/Coding/open-source/Arion/node_modules/@ai-sdk/provider/dist/index').LanguageModelV3StreamPart
    >
    request: { body: string }
    response: { headers: Record<string, string> | undefined }
  }> {
    const { args, warnings } = await this.builder.buildRequest({
      ...options,
      modelId: this.modelId
    })

    const { responseHeaders, value: response } = await postJsonToApi({
      url: this.config.url({ path: '/chat', modelId: this.modelId }),
      headers: combineHeaders(this.config.headers(), options.headers),
      body: { ...args, stream: true },
      failedResponseHandler: ollamaFailedResponseHandler,
      successfulResponseHandler: createNdjsonStreamResponseHandler(baseOllamaResponseSchema),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch
    })

    const streamProcessor = new OllamaStreamProcessor(this.config)
    return {
      stream: response.pipeThrough(streamProcessor.createTransformStream(warnings)),
      request: { body: JSON.stringify(args) },
      response: { headers: responseHeaders }
    }
  }
}
