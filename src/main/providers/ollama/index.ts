import type {
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2StreamPart
} from '@ai-sdk/provider'
import {
  combineHeaders,
  createJsonResponseHandler,
  createJsonStreamResponseHandler,
  postJsonToApi,
  type ParseResult,
  withoutTrailingSlash
} from '@ai-sdk/provider-utils'
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

export function createOllama(options: CreateOllamaOptions) {
  const configuredBase = withoutTrailingSlash(options.baseURL ?? 'http://127.0.0.1:11434')
  const baseURL = configuredBase.endsWith('/api') ? configuredBase : `${configuredBase}/api`
  const providerName = options.name ?? 'ollama'

  const config: OllamaConfig = {
    provider: `${providerName}.responses`,
    url: ({ path }) => `${baseURL}${path}`,
    headers: () => ({ ...(options.headers ?? {}) }),
    fetch: options.fetch
  }

  return (modelId: string): LanguageModelV2 => {
    return new OllamaResponsesLanguageModel(modelId, config)
  }
}

class OllamaResponsesLanguageModel implements LanguageModelV2 {
  readonly specificationVersion = 'v2'
  readonly modelId: string

  private readonly config: OllamaConfig
  private readonly builder = new OllamaRequestBuilder()
  private readonly processor: OllamaResponseProcessor

  constructor(modelId: string, config: OllamaConfig) {
    this.modelId = modelId
    this.config = config
    this.processor = new OllamaResponseProcessor(config)
  }

  get provider() {
    return this.config.provider
  }

  readonly supportedUrls: Record<string, RegExp[]> = {
    'image/*': [/^https?:\/\/.*$/]
  }

  async doGenerate(options: LanguageModelV2CallOptions) {
    const { args, warnings } = await this.builder.buildRequest({
      ...options,
      modelId: this.modelId
    })

    const { responseHeaders, value: response, rawValue } = await postJsonToApi({
      url: this.config.url({ path: '/chat', modelId: this.modelId }),
      headers: combineHeaders(this.config.headers(), options.headers),
      body: { ...args, stream: false },
      failedResponseHandler: ollamaFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(baseOllamaResponseSchema),
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

  async doStream(options: LanguageModelV2CallOptions) {
    const { args, warnings } = await this.builder.buildRequest({
      ...options,
      modelId: this.modelId
    })

    const { responseHeaders, value: response } = await postJsonToApi({
      url: this.config.url({ path: '/chat', modelId: this.modelId }),
      headers: combineHeaders(this.config.headers(), options.headers),
      body: { ...args, stream: true },
      failedResponseHandler: ollamaFailedResponseHandler,
      successfulResponseHandler: createJsonStreamResponseHandler(baseOllamaResponseSchema),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch
    })

    const streamProcessor = new OllamaStreamProcessor(this.config)
    const typedStream = response as ReadableStream<ParseResult<typeof baseOllamaResponseSchema>>
    return {
      stream: typedStream.pipeThrough(streamProcessor.createTransformStream(warnings)),
      request: { body: JSON.stringify(args) },
      response: { headers: responseHeaders }
    }
  }
}
