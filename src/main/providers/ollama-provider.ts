import type {
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2Content,
  LanguageModelV2StreamPart,
  LanguageModelV2FunctionTool,
  LanguageModelV2FinishReason,
  JSONSchema7
} from '@ai-sdk/provider'
import { convertAsyncIteratorToReadableStream, createIdGenerator } from '@ai-sdk/provider-utils'
import { Ollama } from 'ollama'

type CreateOllamaOptions = {
  baseURL: string
  headers?: Record<string, string>
  fetch?: typeof globalThis.fetch
}

type OllamaProviderOptions = {
  // Passed through via providerOptions?.ollama
  think?: boolean | 'high' | 'medium' | 'low'
  keep_alive?: string | number
  // Raw options forwarded to Ollama runtime (sampling, penalties, etc.)
  options?: Record<string, unknown>
}

function mapFinishReason(reason: string | undefined): LanguageModelV2FinishReason {
  const r = (reason || '').toLowerCase()
  if (r.includes('length')) return 'length'
  if (r.includes('tool')) return 'tool-calls'
  if (r.includes('stop')) return 'stop'
  if (r.includes('filter')) return 'content-filter'
  if (r.includes('error')) return 'error'
  return 'other'
}

function extractProviderOptions(
  callOptions: LanguageModelV2CallOptions
): OllamaProviderOptions | undefined {
  const po = (callOptions as any).providerOptions as Record<string, any> | undefined
  if (!po) return undefined
  const raw = po['ollama'] as Record<string, any> | undefined
  if (!raw) return undefined
  const { think, keep_alive, options } = raw
  return {
    ...(think !== undefined ? { think } : {}),
    ...(keep_alive !== undefined ? { keep_alive } : {}),
    ...(options !== undefined ? { options } : {})
  }
}

function mapTools(tools: Array<LanguageModelV2FunctionTool> | undefined) {
  if (!tools || tools.length === 0) return undefined
  return tools.map((t) => {
    return {
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema as JSONSchema7
      }
    }
  })
}

function mapPromptToOllamaMessages(prompt: LanguageModelV2CallOptions['prompt']) {
  // Ollama expects an array of { role, content, images?, tool_calls? }
  // We will reduce multi-part content into text for now and pass tool results as role 'tool'.
  const messages: Array<{ role: string; content: string }> = []

  for (const msg of prompt) {
    if (msg.role === 'system') {
      messages.push({ role: 'system', content: msg.content })
      continue
    }

    if (msg.role === 'user') {
      const textParts = msg.content.filter((p: any) => p.type === 'text').map((p: any) => p.text)
      const content = textParts.join('\n')
      messages.push({ role: 'user', content })
      continue
    }

    if (msg.role === 'assistant') {
      const textParts = msg.content.filter((p: any) => p.type === 'text').map((p: any) => p.text)
      const content = textParts.join('\n')
      if (content.length > 0) messages.push({ role: 'assistant', content })
      // Note: tool-call parts within the prompt are typically not included; tool results will arrive as separate tool messages.
      continue
    }

    if (msg.role === 'tool') {
      // Translate tool result parts into a single tool message line for the model
      // Concatenate results as JSON lines for simplicity
      const toolResults = (msg.content as any[])
        .filter((p) => p.type === 'tool-result')
        .map((p) => {
          try {
            return JSON.stringify(p.result)
          } catch {
            return String(p.result)
          }
        })
      if (toolResults.length > 0) {
        messages.push({ role: 'tool', content: toolResults.join('\n') })
      }
      continue
    }
  }

  return messages
}

function buildOllamaRequestFromCall(modelId: string, callOptions: LanguageModelV2CallOptions) {
  const {
    responseFormat,
    maxOutputTokens,
    temperature,
    presencePenalty,
    frequencyPenalty,
    stopSequences,
    topK,
    topP
  } = callOptions

  const providerOptions = extractProviderOptions(callOptions)

  // Base runtime options mapping
  const runtimeOptions: Record<string, unknown> = {
    ...(typeof maxOutputTokens === 'number' ? { num_predict: maxOutputTokens } : {}),
    ...(typeof temperature === 'number' ? { temperature } : {}),
    ...(typeof presencePenalty === 'number' ? { presence_penalty: presencePenalty } : {}),
    ...(typeof frequencyPenalty === 'number' ? { frequency_penalty: frequencyPenalty } : {}),
    ...(Array.isArray(stopSequences) && stopSequences.length > 0 ? { stop: stopSequences } : {}),
    ...(typeof topK === 'number' ? { top_k: topK } : {}),
    ...(typeof topP === 'number' ? { top_p: topP } : {})
  }

  // Merge in provider-specific options. Provider-specified `options` wins if set
  const mergedOllamaOptions: Record<string, unknown> = {
    ...runtimeOptions,
    ...(providerOptions?.options || {})
  }

  const ollamaRequest: any = {
    model: modelId,
    messages: mapPromptToOllamaMessages(callOptions.prompt),
    stream: false,
    ...(providerOptions?.keep_alive !== undefined
      ? { keep_alive: providerOptions.keep_alive }
      : {}),
    ...(providerOptions?.think !== undefined ? { think: providerOptions.think } : {}),
    ...(Object.keys(mergedOllamaOptions).length > 0 ? { options: mergedOllamaOptions } : {})
  }

  // Tools mapping
  if (callOptions.tools && callOptions.tools.length > 0) {
    const functionTools = callOptions.tools.filter(
      (t: any) => t.type === 'function'
    ) as Array<LanguageModelV2FunctionTool>
    if (functionTools.length > 0) {
      ollamaRequest.tools = mapTools(functionTools)
    }
  }

  // Response format mapping
  if (responseFormat) {
    if (responseFormat.type === 'json') {
      if (responseFormat.schema) {
        ollamaRequest.format = responseFormat.schema as unknown as object
      } else {
        ollamaRequest.format = 'json'
      }
    }
  }

  return ollamaRequest
}

function createStreamFromOllamaSource(source: any, abortSignal?: AbortSignal) {
  // Normalize various possible return types from the Ollama client
  let baseStream: ReadableStream<any>

  // Case 1: AsyncIterator (has next())
  if (source && typeof source.next === 'function') {
    baseStream = convertAsyncIteratorToReadableStream<any>(source as AsyncIterator<any>)
  }
  // Case 2: AsyncIterable (has Symbol.asyncIterator)
  else if (source && typeof source[Symbol.asyncIterator] === 'function') {
    const iterator = source[Symbol.asyncIterator]() as AsyncIterator<any>
    baseStream = convertAsyncIteratorToReadableStream<any>(iterator)
  }
  // Case 3: WHATWG ReadableStream (has getReader())
  else if (source && typeof source.getReader === 'function') {
    baseStream = source as ReadableStream<any>
  } else {
    throw new Error('Unexpected stream type from Ollama client')
  }

  if (!abortSignal) return baseStream

  // Add abort handling wrapper around the base stream
  const reader = baseStream.getReader()
  const controlled = new ReadableStream<any>({
    start(controller) {
      function onAbort() {
        try {
          if (source && typeof source.abort === 'function') (source as any).abort()
        } catch {}
        controller.error(new DOMException('Aborted', 'AbortError'))
      }
      if (abortSignal.aborted) return onAbort()
      const abortHandler = onAbort
      abortSignal.addEventListener('abort', abortHandler)
      ;(async () => {
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            controller.enqueue(value)
          }
          controller.close()
        } catch (err) {
          controller.error(err)
        } finally {
          abortSignal.removeEventListener('abort', abortHandler)
        }
      })()
    }
  })
  return controlled
}

export function createOllama({ baseURL, headers, fetch }: CreateOllamaOptions) {
  const client = new Ollama({ host: baseURL, headers, fetch })
  const idGenTool = createIdGenerator({ prefix: 'tool', size: 8 })
  const idGenReason = createIdGenerator({ prefix: 'reason', size: 8 })
  const idGenText = createIdGenerator({ prefix: 'text', size: 8 })

  return (modelId: string): LanguageModelV2 => {
    return {
      specificationVersion: 'v2',
      provider: 'ollama',
      modelId,
      supportedUrls: {},

      async doGenerate(options: LanguageModelV2CallOptions) {
        const req = buildOllamaRequestFromCall(modelId, options)
        req.stream = false
        const res = await client.chat(req)

        const content: LanguageModelV2Content[] = []
        const msg = (res as any)?.message
        if (msg?.thinking && String(msg.thinking).length > 0) {
          content.push({ type: 'reasoning', text: String(msg.thinking) })
        }
        if (msg?.content && String(msg.content).length > 0) {
          content.push({ type: 'text', text: String(msg.content) })
        }
        if (Array.isArray(msg?.tool_calls)) {
          for (const call of msg.tool_calls) {
            let args: unknown = call.function?.arguments ?? {}
            if (typeof args === 'string') {
              try {
                args = JSON.parse(args)
              } catch {
                // leave as string if not valid JSON
              }
            }
            content.push({
              type: 'tool-call',
              toolCallId: idGenTool(),
              toolName: call.function?.name,
              args: args as any
            } as any)
          }
        }

        const usage = {
          inputTokens: (res as any)?.prompt_eval_count,
          outputTokens: (res as any)?.eval_count,
          totalTokens:
            typeof (res as any)?.prompt_eval_count === 'number' &&
            typeof (res as any)?.eval_count === 'number'
              ? (res as any).prompt_eval_count + (res as any).eval_count
              : undefined,
          reasoningTokens: undefined,
          cachedInputTokens: undefined
        }

        return {
          content,
          finishReason: mapFinishReason((res as any)?.done_reason),
          usage,
          providerMetadata: undefined,
          request: { body: req },
          response: undefined,
          warnings: []
        }
      },

      async doStream(options: LanguageModelV2CallOptions) {
        const req = buildOllamaRequestFromCall(modelId, options)
        req.stream = true
        const streamSource = await client.chat(req)

        // Map Ollama streaming parts into LanguageModelV2StreamPart events
        const stream = createStreamFromOllamaSource(streamSource, options.abortSignal)
        const reader = stream.getReader()
        let textStarted = false
        let reasoningStarted = false
        let textId: string | null = null
        let reasoningId: string | null = null

        const mapped = new ReadableStream<LanguageModelV2StreamPart>({
          async start(controller) {
            controller.enqueue({ type: 'stream-start', warnings: [] })
            controller.enqueue({ type: 'response-metadata', modelId, timestamp: new Date() })

            try {
              while (true) {
                const { done, value } = await reader.read()
                if (done) break

                const part = value
                const msg = part?.message

                // Reasoning deltas
                if (msg?.thinking) {
                  if (!reasoningStarted) {
                    reasoningId = idGenReason()
                    controller.enqueue({ type: 'reasoning-start', id: reasoningId })
                    reasoningStarted = true
                  }
                  controller.enqueue({
                    type: 'reasoning-delta',
                    id: reasoningId as string,
                    delta: String(msg.thinking)
                  })
                }

                // Text deltas
                if (msg?.content) {
                  if (!textStarted) {
                    textId = idGenText()
                    controller.enqueue({ type: 'text-start', id: textId })
                    textStarted = true
                  }
                  controller.enqueue({
                    type: 'text-delta',
                    id: textId as string,
                    delta: String(msg.content)
                  })
                }

                // Tool calls
                if (Array.isArray(msg?.tool_calls) && msg.tool_calls.length > 0) {
                  for (const call of msg.tool_calls) {
                    let args: unknown = call.function?.arguments ?? {}
                    if (typeof args === 'string') {
                      try {
                        args = JSON.parse(args)
                      } catch {
                        // keep as string if not JSON
                      }
                    }
                    controller.enqueue({
                      type: 'tool-call',
                      toolCallId: idGenTool(),
                      toolName: call.function?.name,
                      args: args as any,
                      providerExecuted: false
                    } as any)
                  }
                }

                // Finish
                if (part?.done) {
                  if (reasoningStarted)
                    controller.enqueue({ type: 'reasoning-end', id: reasoningId as string })
                  if (textStarted) controller.enqueue({ type: 'text-end', id: textId as string })

                  const usage = {
                    inputTokens: (part as any)?.prompt_eval_count,
                    outputTokens: (part as any)?.eval_count,
                    totalTokens:
                      typeof (part as any)?.prompt_eval_count === 'number' &&
                      typeof (part as any)?.eval_count === 'number'
                        ? (part as any).prompt_eval_count + (part as any).eval_count
                        : undefined,
                    reasoningTokens: undefined,
                    cachedInputTokens: undefined
                  }

                  controller.enqueue({
                    type: 'finish',
                    usage,
                    finishReason: mapFinishReason((part as any)?.done_reason)
                  })
                }
              }
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err)
              controller.enqueue({ type: 'error', error: message })
            } finally {
              controller.close()
            }
          }
        })

        return { stream: mapped, response: { headers: undefined } }
      }
    }
  }
}
