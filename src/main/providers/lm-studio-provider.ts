import type {
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2Content,
  LanguageModelV2StreamPart,
  LanguageModelV2FunctionTool,
  LanguageModelV2FinishReason
} from '@ai-sdk/provider'
import { createIdGenerator } from '@ai-sdk/provider-utils'
import {
  extractReasoningFromText,
  detectReasoningModel
} from '../services/reasoning-model-detector'

type CreateLMStudioOptions = {
  baseURL: string
  headers?: Record<string, string>
  fetch?: typeof globalThis.fetch
}

type LMStudioProviderOptions = {
  // Passed through via providerOptions?.lmStudio
  temperature?: number
  max_tokens?: number
  top_p?: number
  top_k?: number
  frequency_penalty?: number
  presence_penalty?: number
  stop?: string[]
  // Raw options forwarded to LM Studio runtime
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
): LMStudioProviderOptions | undefined {
  const po = (callOptions as any).providerOptions as Record<string, any> | undefined
  if (!po) return undefined
  const raw = po['lmStudio'] as Record<string, any> | undefined
  if (!raw) return undefined
  const {
    temperature,
    max_tokens,
    top_p,
    top_k,
    frequency_penalty,
    presence_penalty,
    stop,
    options
  } = raw
  return {
    ...(temperature !== undefined ? { temperature } : {}),
    ...(max_tokens !== undefined ? { max_tokens } : {}),
    ...(top_p !== undefined ? { top_p } : {}),
    ...(top_k !== undefined ? { top_k } : {}),
    ...(frequency_penalty !== undefined ? { frequency_penalty } : {}),
    ...(presence_penalty !== undefined ? { presence_penalty } : {}),
    ...(stop !== undefined ? { stop } : {}),
    ...(options !== undefined ? { options } : {})
  }
}

function mapTools(tools: Array<LanguageModelV2FunctionTool> | undefined) {
  if (!tools || tools.length === 0) return undefined
  return tools.map((t) => {
    try {
      // In AI SDK v5, tools may come with different schema formats
      // Check if we have a JSON Schema already, or if we need to convert from Zod
      const schema = t.inputSchema as any

      // Check if it's already a JSON Schema format
      if (schema && typeof schema === 'object' && schema.type === 'object' && schema.properties) {
        return {
          type: 'function',
          function: {
            name: t.name,
            description: t.description,
            parameters: schema
          }
        }
      }

      // If it's a Zod schema with _def property, extract the shape
      if (schema && schema._def) {
        const properties: Record<string, any> = {}
        const required: string[] = []

        // Get the shape - it might be a function or a property
        const shape =
          typeof schema._def.shape === 'function' ? schema._def.shape() : schema._def.shape

        if (shape && typeof shape === 'object') {
          for (const [key, value] of Object.entries(shape as Record<string, any>)) {
            // Extract type information from Zod schema
            const zodDef = (value as any)._def
            if (!zodDef) continue

            const zodType = zodDef.typeName || 'ZodString'
            let type = 'string'

            if (zodType.includes('Number')) type = 'number'
            else if (zodType.includes('Boolean')) type = 'boolean'
            else if (zodType.includes('Array')) type = 'array'
            else if (zodType.includes('Object')) type = 'object'

            // Ensure properties only have simple types
            properties[key] = { type }

            // Check if field is required (not optional)
            if (!zodType.includes('Optional') && !(value as any).isOptional) {
              required.push(key)
            }
          }
        }

        return {
          type: 'function',
          function: {
            name: t.name,
            description: t.description,
            parameters: {
              type: 'object',
              properties,
              required
            }
          }
        }
      }

      // Fallback - don't pass raw Zod schema to LM Studio
      // Create a simple schema that won't cause template errors
      return {
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: {
            type: 'object',
            properties: {},
            required: []
          }
        }
      }
    } catch (error) {
      console.warn(`[LM Studio] Failed to map tool ${t.name}:`, error)
      // Return a minimal schema to avoid breaking
      return {
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: {
            type: 'object',
            properties: {},
            required: []
          }
        }
      }
    }
  })
}

function mapPromptToLMStudioMessages(prompt: LanguageModelV2CallOptions['prompt']) {
  // LM Studio expects an array of { role, content } following OpenAI format
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
      continue
    }

    if (msg.role === 'tool') {
      // Translate tool result parts into a single tool message line for the model
      const toolResults = (msg.content as any[])
        .filter((p) => p.type === 'tool-result')
        .map((p) => {
          try {
            // Ensure result is always a string for LM Studio
            if (typeof p.result === 'string') {
              return p.result
            }
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

function buildLMStudioRequestFromCall(modelId: string, callOptions: LanguageModelV2CallOptions) {
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
    ...(typeof maxOutputTokens === 'number' ? { max_tokens: maxOutputTokens } : {}),
    ...(typeof temperature === 'number' ? { temperature } : {}),
    ...(typeof presencePenalty === 'number' ? { presence_penalty: presencePenalty } : {}),
    ...(typeof frequencyPenalty === 'number' ? { frequency_penalty: frequencyPenalty } : {}),
    ...(Array.isArray(stopSequences) && stopSequences.length > 0 ? { stop: stopSequences } : {}),
    ...(typeof topK === 'number' ? { top_k: topK } : {}),
    ...(typeof topP === 'number' ? { top_p: topP } : {})
  }

  // Merge in provider-specific options. Provider-specified options win if set
  const mergedOptions: Record<string, unknown> = {
    ...runtimeOptions,
    ...(providerOptions?.options || {})
  }

  const lmStudioRequest: any = {
    model: modelId,
    messages: mapPromptToLMStudioMessages(callOptions.prompt),
    stream: false,
    ...mergedOptions
  }

  // Tools mapping with error handling
  if (callOptions.tools && callOptions.tools.length > 0) {
    const functionTools = callOptions.tools.filter(
      (t: any) => t.type === 'function'
    ) as Array<LanguageModelV2FunctionTool>
    if (functionTools.length > 0) {
      try {
        lmStudioRequest.tools = mapTools(functionTools)
        // Log the tools being sent to help debug
      } catch (e) {
        console.error('[LM Studio] Error mapping tools, disabling tools for this request:', e)
        // Don't include tools if mapping fails
      }
    }
  }

  // Response format mapping
  if (responseFormat) {
    if (responseFormat.type === 'json') {
      if (responseFormat.schema) {
        lmStudioRequest.response_format = {
          type: 'json_object',
          schema: responseFormat.schema
        }
      } else {
        lmStudioRequest.response_format = { type: 'json_object' }
      }
    }
  }

  return lmStudioRequest
}

async function makeLMStudioRequest(
  baseURL: string,
  request: any,
  headers?: Record<string, string>,
  fetchFn?: typeof globalThis.fetch
) {
  const fetch = fetchFn || globalThis.fetch
  const url = `${baseURL}/v1/chat/completions`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    body: JSON.stringify(request)
  })

  if (!response.ok) {
    throw new Error(`LM Studio API error: ${response.status} ${response.statusText}`)
  }

  return response
}

function createStreamFromLMStudioResponse(response: Response, abortSignal?: AbortSignal) {
  if (!response.body) {
    throw new Error('No response body from LM Studio')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()

  const stream = new ReadableStream({
    async start(controller) {
      try {
        while (true) {
          if (abortSignal?.aborted) {
            controller.error(new DOMException('Aborted', 'AbortError'))
            return
          }

          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value, { stream: true })
          const lines = chunk.split('\n').filter((line) => line.trim())

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim()
              if (data === '[DONE]') {
                controller.close()
                return
              }

              try {
                const parsed = JSON.parse(data)
                controller.enqueue(parsed)
              } catch (e) {
                // Skip malformed JSON
                console.warn('[LM Studio] Skipping malformed JSON:', data)
              }
            }
          }
        }
        controller.close()
      } catch (error) {
        controller.error(error)
      }
    }
  })

  return stream
}

export function createLMStudio({ baseURL, headers, fetch }: CreateLMStudioOptions) {
  const idGenTool = createIdGenerator({ prefix: 'tool', size: 8 })
  const idGenText = createIdGenerator({ prefix: 'text', size: 8 })
  const idGenReason = createIdGenerator({ prefix: 'reason', size: 8 })

  return (modelId: string): LanguageModelV2 => {
    return {
      specificationVersion: 'v2',
      provider: 'lm-studio',
      modelId,
      supportedUrls: {},

      async doGenerate(options: LanguageModelV2CallOptions) {
        const req = buildLMStudioRequestFromCall(modelId, options)
        req.stream = false

        const response = await makeLMStudioRequest(baseURL, req, headers, fetch)
        const res = await response.json()

        const content: LanguageModelV2Content[] = []
        const choice = res.choices?.[0]
        const message = choice?.message

        // Handle native LM Studio reasoning content (available in LM Studio 0.3.9+)

        // Check both possible field names for reasoning
        const reasoningText = message?.reasoning_content || message?.reasoning
        if (reasoningText && String(reasoningText).length > 0) {
          content.push({ type: 'reasoning', text: String(reasoningText) })
        }

        if (message?.content && String(message.content).length > 0) {
          const fullText = String(message.content)
          const isReasoningModel = detectReasoningModel(modelId)

          if (isReasoningModel && !message?.reasoning_content) {
            // Fallback: Try to extract reasoning from the content if native reasoning_content is not available
            const { content: cleanContent, reasoningText } = extractReasoningFromText(fullText)

            // Add reasoning content if found
            if (reasoningText && reasoningText.length > 0) {
              content.push({ type: 'reasoning', text: reasoningText })
            }

            // Add the clean content (without reasoning markers)
            if (cleanContent && cleanContent.length > 0) {
              content.push({ type: 'text', text: cleanContent })
            }
          } else {
            // For non-reasoning models or when native reasoning is available, just add the content as-is
            content.push({ type: 'text', text: fullText })
          }
        }

        if (Array.isArray(message?.tool_calls)) {
          for (const call of message.tool_calls) {
            let args: unknown = call.function?.arguments ?? {}

            // LM Studio may return arguments as a string that needs parsing
            if (typeof args === 'string') {
              try {
                args = JSON.parse(args)
              } catch (e) {
                console.warn(
                  `[LM Studio] Failed to parse tool arguments for ${call.function?.name}:`,
                  e
                )
                // Try to parse as a simple object if it's malformed JSON
                args = { input: args }
              }
            }

            // Ensure we have a valid tool name
            if (!call.function?.name) {
              console.warn('[LM Studio] Tool call missing function name:', call)
              continue
            }

            content.push({
              type: 'tool-call',
              toolCallId: call.id || idGenTool(),
              toolName: call.function.name,
              args: args as any
            } as any)
          }
        }

        const usage = {
          inputTokens: res.usage?.prompt_tokens,
          outputTokens: res.usage?.completion_tokens,
          totalTokens: res.usage?.total_tokens,
          reasoningTokens: undefined,
          cachedInputTokens: undefined
        }

        // Convert Headers to plain object
        const responseHeaders: Record<string, string> = {}
        response.headers.forEach((value, key) => {
          responseHeaders[key] = value
        })

        return {
          content,
          finishReason: mapFinishReason(choice?.finish_reason),
          usage,
          providerMetadata: undefined,
          request: { body: req },
          response: { headers: responseHeaders },
          warnings: []
        }
      },

      async doStream(options: LanguageModelV2CallOptions) {
        const req = buildLMStudioRequestFromCall(modelId, options)
        req.stream = true

        const response = await makeLMStudioRequest(baseURL, req, headers, fetch)

        // Map LM Studio streaming parts into LanguageModelV2StreamPart events
        const stream = createStreamFromLMStudioResponse(response, options.abortSignal)
        const reader = stream.getReader()
        let textStarted = false
        let reasoningStarted = false
        let textId: string | null = null
        let reasoningId: string | null = null

        // For reasoning models, we need to accumulate content to detect patterns
        const isReasoningModel = detectReasoningModel(modelId)
        let accumulatedContent = ''
        let lastProcessedLength = 0

        const mapped = new ReadableStream<LanguageModelV2StreamPart>({
          async start(controller) {
            controller.enqueue({ type: 'stream-start', warnings: [] })
            controller.enqueue({ type: 'response-metadata', modelId, timestamp: new Date() })

            try {
              while (true) {
                const { done, value } = await reader.read()
                if (done) break

                const part = value
                const choice = part.choices?.[0]
                const delta = choice?.delta

                // Handle native LM Studio reasoning deltas (available in LM Studio 0.3.9+)
                const reasoningDelta = delta?.reasoning_content || delta?.reasoning
                if (reasoningDelta) {
                  if (!reasoningStarted) {
                    reasoningId = idGenReason()
                    controller.enqueue({ type: 'reasoning-start', id: reasoningId })
                    reasoningStarted = true
                  }
                  controller.enqueue({
                    type: 'reasoning-delta',
                    id: reasoningId as string,
                    delta: String(reasoningDelta)
                  })
                }

                // Text deltas
                if (delta?.content) {
                  const deltaContent = String(delta.content)
                  accumulatedContent += deltaContent

                  // Check if we should use fallback parsing (only if no native reasoning was detected in the stream)
                  const hasNativeReasoning =
                    reasoningStarted || delta?.reasoning || delta?.reasoning_content
                  if (isReasoningModel && !hasNativeReasoning) {
                    // Fallback: For reasoning models without native reasoning support, parse content
                    const thinkingStartPattern = /<think>/i
                    const thinkingEndPattern = /<\/think>/i

                    // Check if we're starting reasoning
                    if (!reasoningStarted && thinkingStartPattern.test(accumulatedContent)) {
                      reasoningStarted = true
                      reasoningId = idGenReason()
                      controller.enqueue({ type: 'reasoning-start', id: reasoningId })
                    }

                    // If we're in reasoning mode, send reasoning deltas
                    if (reasoningStarted && !thinkingEndPattern.test(accumulatedContent)) {
                      // Extract content after the <think> tag
                      const thinkMatch = accumulatedContent.match(/<think>([\s\S]*?)$/i)
                      if (thinkMatch) {
                        const reasoningContent = thinkMatch[1]
                        const newReasoningContent = reasoningContent.substring(lastProcessedLength)
                        if (newReasoningContent.length > 0) {
                          controller.enqueue({
                            type: 'reasoning-delta',
                            id: reasoningId as string,
                            delta: newReasoningContent
                          })
                          lastProcessedLength = reasoningContent.length
                        }
                      }
                    }

                    // Check if we're ending reasoning and starting regular content
                    if (reasoningStarted && thinkingEndPattern.test(accumulatedContent)) {
                      controller.enqueue({ type: 'reasoning-end', id: reasoningId as string })
                      reasoningStarted = false

                      // Start text content
                      if (!textStarted) {
                        textId = idGenText()
                        controller.enqueue({ type: 'text-start', id: textId })
                        textStarted = true
                      }

                      // Send any content after </think>
                      const afterThinkMatch = accumulatedContent.match(/<\/think>([\s\S]*)$/i)
                      if (afterThinkMatch && afterThinkMatch[1].length > 0) {
                        controller.enqueue({
                          type: 'text-delta',
                          id: textId as string,
                          delta: afterThinkMatch[1]
                        })
                      }
                    }

                    // If we're not in reasoning mode and not in a thinking block, send as regular text
                    if (!reasoningStarted && !thinkingStartPattern.test(accumulatedContent)) {
                      if (!textStarted) {
                        textId = idGenText()
                        controller.enqueue({ type: 'text-start', id: textId })
                        textStarted = true
                      }
                      controller.enqueue({
                        type: 'text-delta',
                        id: textId as string,
                        delta: deltaContent
                      })
                    }
                  } else {
                    // For non-reasoning models or when native reasoning is available, stream content directly

                    if (!textStarted) {
                      textId = idGenText()
                      controller.enqueue({ type: 'text-start', id: textId })
                      textStarted = true
                    }
                    controller.enqueue({
                      type: 'text-delta',
                      id: textId as string,
                      delta: deltaContent
                    })
                  }
                }

                // Tool calls
                if (Array.isArray(delta?.tool_calls) && delta.tool_calls.length > 0) {
                  for (const call of delta.tool_calls) {
                    let args: unknown = call.function?.arguments ?? {}

                    // LM Studio may return arguments as a string that needs parsing
                    if (typeof args === 'string') {
                      try {
                        args = JSON.parse(args)
                      } catch (e) {
                        console.warn(
                          `[LM Studio] Failed to parse streaming tool arguments for ${call.function?.name}:`,
                          e
                        )
                        // Try to parse as a simple object if it's malformed JSON
                        args = { input: args }
                      }
                    }

                    // Ensure we have a valid tool name
                    if (!call.function?.name) {
                      console.warn('[LM Studio] Streaming tool call missing function name:', call)
                      continue
                    }

                    controller.enqueue({
                      type: 'tool-call',
                      toolCallId: call.id || idGenTool(),
                      toolName: call.function.name,
                      args: args as any,
                      providerExecuted: false
                    } as any)
                  }
                }

                // Finish
                if (choice?.finish_reason) {
                  if (reasoningStarted) {
                    controller.enqueue({ type: 'reasoning-end', id: reasoningId as string })
                  }
                  if (textStarted) {
                    controller.enqueue({ type: 'text-end', id: textId as string })
                  }

                  const usage = {
                    inputTokens: part.usage?.prompt_tokens,
                    outputTokens: part.usage?.completion_tokens,
                    totalTokens: part.usage?.total_tokens,
                    reasoningTokens: undefined,
                    cachedInputTokens: undefined
                  }

                  controller.enqueue({
                    type: 'finish',
                    usage,
                    finishReason: mapFinishReason(choice.finish_reason)
                  })
                  break
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

        // Convert Headers to plain object
        const streamResponseHeaders: Record<string, string> = {}
        response.headers.forEach((value, key) => {
          streamResponseHeaders[key] = value
        })

        return { stream: mapped, response: { headers: streamResponseHeaders } }
      }
    }
  }
}
