import {
  streamText,
  smoothStream,
  type CoreMessage,
  type LanguageModel,
  convertToCoreMessages
} from 'ai'
import { ModularPromptManager } from './modular-prompt-manager'
import { createOpenAI } from '@ai-sdk/openai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createAzure } from '@ai-sdk/azure'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createVertex } from '@ai-sdk/google-vertex'
import { createOllama } from 'ollama-ai-provider'
import { SettingsService } from './settings-service'
import type { LlmToolService } from './llm-tool-service'
import { MAX_LLM_STEPS } from '../constants/llm-constants'

// Interface for the request body from the renderer
interface ChatRequestBody {
  messages: CoreMessage[] // Using CoreMessage from 'ai' SDK
  // Potentially other properties like model, id, etc. depending on useChat configuration
}

// Define a type for streaming callbacks
export interface StreamingCallbacks {
  onChunk: (chunk: Uint8Array) => void
  onError: (error: Error) => void
  onComplete: () => void
}

interface PreparedMessagesResult {
  processedMessages: CoreMessage[]
  finalSystemPrompt: string | null
}

export class ChatService {
  private settingsService: SettingsService
  private llmToolService: LlmToolService
  private modularPromptManager: ModularPromptManager

  constructor(
    settingsService: SettingsService, 
    llmToolService: LlmToolService,
    modularPromptManager: ModularPromptManager
  ) {
    this.settingsService = settingsService
    this.llmToolService = llmToolService
    this.modularPromptManager = modularPromptManager
    console.log('[ChatService] Initialized with LlmToolService')
  }

  // Shared method to prepare messages and extract system prompt
  private async prepareMessagesAndSystemPrompt(
    rendererMessages: CoreMessage[],
    chatId?: string,
    agentId?: string
  ): Promise<PreparedMessagesResult> {
    let coreMessages = convertToCoreMessages(rendererMessages as any)
    let finalSystemPrompt: string | null = null

    if (!coreMessages) {
      // Handle case where conversion might result in undefined/null if input is very unusual
      console.warn(
        '[ChatService] prepareMessages: coreMessages array is undefined/null after conversion.'
      )
      return { processedMessages: [], finalSystemPrompt: null }
    }

    // Attempt to construct the system prompt
    try {
      // Get the basic system prompt configuration
      const systemPromptConfig = await this.settingsService.getSystemPromptConfig()
      let baseSystemPrompt = systemPromptConfig.defaultSystemPrompt
      
      // Add user system prompt if provided
      if (systemPromptConfig.userSystemPrompt) {
        baseSystemPrompt = `${baseSystemPrompt}\n\n${systemPromptConfig.userSystemPrompt}`
      }
      
      // Use the modular prompt manager to get a system prompt if available
      // If chatId and/or agentId are provided, we can get a more specific system prompt
      if (this.modularPromptManager) {
        try {
          const context = {
            chatId: chatId || 'default',
            timestamp: new Date().toISOString(),
            // Add any other context that would be useful for prompt assembly
          }
          
          const moduleBasedPrompt = await this.modularPromptManager.getSystemPrompt(
            chatId || 'default',
            baseSystemPrompt,
            agentId,
            context
          )
          
          // Use the assembled prompt if it was successfully generated
          if (moduleBasedPrompt) {
            finalSystemPrompt = moduleBasedPrompt
            console.log('[ChatService] Using modular system prompt')
          } else {
            finalSystemPrompt = baseSystemPrompt
            console.log('[ChatService] Falling back to base system prompt')
          }
        } catch (error) {
          console.warn('[ChatService] Error using modular prompt manager, falling back to base system prompt:', error)
          finalSystemPrompt = baseSystemPrompt
        }
      } else {
        // No modular prompt manager available, use the base system prompt
        finalSystemPrompt = baseSystemPrompt
        console.log('[ChatService] No modular prompt manager available, using base system prompt')
      }
    } catch (error) {
      console.warn(
        '[ChatService] Error constructing system prompt, proceeding without it or with a partial one if already set:',
        error
      )
    }

    // Remove any existing system message from coreMessages as it will be passed separately
    if (coreMessages.length > 0 && coreMessages[0].role === 'system') {
      // If a system message was already present, and we didn't construct one due to error,
      // we might want to use the original one. However, current logic aims to construct a new one.
      // For simplicity now, we prioritize the constructed finalSystemPrompt.
      // If finalSystemPrompt is null here (due to error), and there was an original system message,
      // that original system message will be removed and no system prompt will be passed via the 'system' property.
      // This behavior can be refined if needed.
      if (!finalSystemPrompt && coreMessages[0].content) {
        // Fallback: if we failed to build a new system prompt, but one existed, use the existing one.
        // This is a slight deviation to prevent losing an existing system prompt if construction fails.
        finalSystemPrompt = coreMessages[0].content as string
      }
      coreMessages = coreMessages.slice(1) // Remove the first message (assumed to be system)
      console.log(
        '[ChatService] Removed existing system message from messages array to use dedicated system property.'
      )
    }

    console.log(
      '[ChatService] Messages prepared for LLM (system prompt to be passed separately):',
      JSON.stringify(coreMessages, null, 2).substring(0, 500) + '...'
    )
    if (finalSystemPrompt) {
      console.log(
        '[ChatService] System prompt to be used:',
        finalSystemPrompt.substring(0, 300) + '...'
      )
    }

    return { processedMessages: coreMessages, finalSystemPrompt }
  }

  // Legacy method that collects all chunks and returns them at once
  async handleSendMessageStream(body: ChatRequestBody & { id?: string, agentId?: string }): Promise<Uint8Array[]> {
    const { messages: rendererMessages, agentId } = body
    
    // Set the chat ID in the LlmToolService for permission tracking
    if (body.id) {
      this.llmToolService.setCurrentChatId(body.id)
    }
    const streamChunks: Uint8Array[] = []
    const textEncoder = new TextEncoder()

    try {
      const { processedMessages, finalSystemPrompt } =
        await this.prepareMessagesAndSystemPrompt(rendererMessages, body.id, agentId)

      if (!processedMessages || processedMessages.length === 0) {
        if (!finalSystemPrompt) {
          // Only error if there's no system prompt to guide an empty message list either
          console.error(
            '[ChatService] No messages or system prompt to send after preparation step.'
          )
          streamChunks.push(
            textEncoder.encode(
              JSON.stringify({
                streamError: 'No messages or system prompt to send after preparation.'
              })
            )
          )
          return streamChunks
        }
      }

      const activeProvider = await this.settingsService.getActiveLLMProvider()
      let llm: LanguageModel | undefined = undefined

      if (!activeProvider) {
        console.error('[ChatService] No active LLM provider configured.')
        streamChunks.push(
          textEncoder.encode(JSON.stringify({ streamError: 'No active LLM provider configured.' }))
        )
        return streamChunks
      }
      console.log(`[ChatService] Active provider: ${activeProvider}`)

      console.log(
        '[ChatService] Messages from renderer:',
        JSON.stringify(rendererMessages, null, 2)
      )
      console.log(
        '[ChatService] Converted to CoreMessages:',
        JSON.stringify(processedMessages, null, 2)
      )

      if (!processedMessages || processedMessages.length === 0) {
        console.warn('[ChatService] coreMessages array is empty or undefined after conversion.')
        // Handle cases where LLM might require messages
        streamChunks.push(
          textEncoder.encode(JSON.stringify({ streamError: 'Cannot process empty message list.' }))
        )
        return streamChunks
      }

      switch (activeProvider) {
        case 'openai':
          const openaiConfig = await this.settingsService.getOpenAIConfig()
          if (!openaiConfig?.apiKey || !openaiConfig.model) {
            throw new Error('OpenAI provider is not configured correctly.')
          }
          const customOpenAI = createOpenAI({ apiKey: openaiConfig.apiKey })
          llm = customOpenAI.chat(openaiConfig.model as any)
          console.log(`[ChatService] Using OpenAI model: ${openaiConfig.model}`)
          break
        case 'google':
          const googleConfig = await this.settingsService.getGoogleConfig()
          if (!googleConfig?.apiKey || !googleConfig.model) {
            throw new Error('Google provider is not configured correctly.')
          }
          const customGoogleProvider = createGoogleGenerativeAI({ apiKey: googleConfig.apiKey })
          llm = customGoogleProvider(googleConfig.model as any)
          console.log(`[ChatService] Using Google model: ${googleConfig.model}`)
          break
        case 'azure':
          const azureConfig = await this.settingsService.getAzureConfig()
          if (!azureConfig?.apiKey || !azureConfig.endpoint || !azureConfig.deploymentName) {
            throw new Error('Azure OpenAI provider is not configured correctly.')
          }
          const configuredAzure = createAzure({
            apiKey: azureConfig.apiKey,
            baseURL: azureConfig.endpoint, // Use endpoint directly as baseURL
            apiVersion: '2024-04-01-preview' // Use a known stable or desired preview version
          })
          llm = configuredAzure.chat(azureConfig.deploymentName)
          console.log(
            `[ChatService] Using Azure deployment: ${azureConfig.deploymentName} on endpoint ${azureConfig.endpoint}`
          )
          break
        case 'anthropic':
          const anthropicConfig = await this.settingsService.getAnthropicConfig()
          if (!anthropicConfig?.apiKey || !anthropicConfig.model) {
            throw new Error('Anthropic provider is not configured correctly.')
          }
          const customAnthropic = createAnthropic({ apiKey: anthropicConfig.apiKey })
          llm = customAnthropic.messages(anthropicConfig.model as any)
          console.log(`[ChatService] Using Anthropic model: ${anthropicConfig.model}`)
          break
        case 'vertex':
          const vertexConfig = await this.settingsService.getVertexConfig()
          if (
            !vertexConfig?.apiKey ||
            !vertexConfig.project ||
            !vertexConfig.location ||
            !vertexConfig.model
          ) {
            throw new Error('Vertex AI provider is not configured correctly.')
          }
          let credentialsJson: any = undefined
          try {
            if (vertexConfig.apiKey.trim().startsWith('{')) {
              credentialsJson = JSON.parse(vertexConfig.apiKey)
            }
          } catch (e) {
            console.error(
              '[ChatService] Failed to parse Vertex API key as JSON, proceeding assuming Application Default Credentials or direct key support:',
              e
            )
          }
          const vertexProvider = createVertex({
            // Pass parsed credentials if available, otherwise SDK uses ADC or other methods
            ...(credentialsJson ? { googleAuthOptions: { credentials: credentialsJson } } : {}),
            project: vertexConfig.project,
            location: vertexConfig.location
          })
          llm = vertexProvider(vertexConfig.model as any)
          console.log(
            `[ChatService] Using Vertex AI model: ${vertexConfig.model} in project ${vertexConfig.project} at ${vertexConfig.location}`
          )
          break
        case 'ollama':
          const ollamaConfig = await this.settingsService.getOllamaConfig()
          if (!ollamaConfig?.baseURL || !ollamaConfig.model) {
            throw new Error('Ollama provider is not configured correctly.')
          }
          const customOllama = createOllama({
            baseURL: ollamaConfig.baseURL
          })
          llm = customOllama(ollamaConfig.model as any)
          console.log(
            `[ChatService] Using Ollama model: ${ollamaConfig.model} via ${ollamaConfig.baseURL}`
          )
          break
        default:
          throw new Error(`Unsupported LLM provider: ${activeProvider}`)
      }

      if (!llm) {
        throw new Error('LLM model could not be initialized.')
      }

      // Get ALL tool definitions from LlmToolService (includes built-in and assimilated MCP tools)
      const combinedTools = this.llmToolService.getToolDefinitionsForLLM()
      console.log(
        '[ChatService] Combined tools from LlmToolService for LLM:',
        Object.keys(combinedTools)
      )

      // Define streamText options
      const streamTextOptions: Parameters<typeof streamText>[0] = {
        model: llm,
        messages: processedMessages,
        system: finalSystemPrompt || '',
        ...(Object.keys(combinedTools).length > 0 && { tools: combinedTools }),
        maxSteps: MAX_LLM_STEPS,
        experimental_transform: smoothStream({}),
        onFinish: async (event) => {
          console.log('[ChatService] streamText finished.', event)
          // Cleanup of MCP clients is handled by MCPClientService itself on shutdown, or if specific clients were managed by Vercel adapter previously.
          // Since we removed direct Vercel adapter client management here, no specific cleanup here.
          // if (activeMcpClientsForVercelSDK.length > 0) {
          //   console.log('[ChatService] Closing Vercel MCP clients after successful stream finish.')
          //   await cleanupVercelMcpClients(activeMcpClientsForVercelSDK)
          //   activeMcpClientsForVercelSDK = [] // Clear the array
          // }
        }
      }

      // Apply smoothStream specifically for Azure if needed
      // Note: smoothStream might be deprecated or replaced by internal handling in newer SDK versions. Check SDK docs if issues arise.
      // if (activeProvider === 'azure') {
      //   streamTextOptions.experimental_transform = smoothStream()
      //   console.log('[ChatService] Applying smoothStream for Azure provider.')
      // }

      // --- Execute the streamText call ---

      const result = await streamText(streamTextOptions)

      // --- Stream the response back ---
      console.log('[ChatService] Starting to iterate stream from streamText...')
      for await (const part of result.fullStream) {
        switch (part.type) {
          case 'text-delta':
            // Stream text back to the renderer
            console.log('[ChatService] Received text-delta:', part.textDelta)
            streamChunks.push(textEncoder.encode(part.textDelta))
            break
          case 'tool-call':
            // Log the tool call attempt (execution is handled internally by SDK via 'execute')
            console.log('[ChatService] Received tool-call part (handled by SDK):', part)
            // Do not push this part to the client directly unless the UI needs to show pending tool calls.
            // The SDK handles sending this back to the LLM with the result.
            break
          case 'error':
            // Handle errors reported by the stream
            console.error('[ChatService] Error part from streamText:', part.error)
            // Provide a structured error message back to the client
            streamChunks.push(
              textEncoder.encode(JSON.stringify({ streamError: `LLM stream error: ${part.error}` }))
            )
            // Depending on the error, you might want to stop processing or throw
            // For now, we push the error and let the stream end.
            break
          case 'finish':
            // Log the finish event
            console.log('[ChatService] Received finish part:', part)
            // The onFinish callback handles cleanup.
            break
          // Handle other potential part types if the SDK introduces them
          default:
            console.log('[ChatService] Received unhandled stream part type:', part.type, part)
            break
        }
      }

      console.log('[ChatService] Stream iteration finished.')
      return streamChunks
    } catch (error) {
      console.error('[ChatService] Uncaught error handling send message stream:', error)
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred'
      // Ensure a structured error is sent back if an exception escapes the stream loop
      streamChunks.push(textEncoder.encode(JSON.stringify({ streamError: errorMessage })))
      return streamChunks
    } finally {
      // Ensure cleanup runs if an error occurred *before* or *during* stream setup,
      // or if the onFinish callback wasn't reached.
      // Removed direct Vercel MCP client cleanup as it's no longer managed here.
      // if (activeMcpClientsForVercelSDK.length > 0) {
      //   console.warn(
      //     '[ChatService] Closing Vercel MCP clients in finally block (may indicate premature exit or error).'
      //   )
      //   await cleanupVercelMcpClients(activeMcpClientsForVercelSDK)
      // }
    }
  }

  // NEW METHOD: Real-time streaming that sends chunks as they arrive
  async handleStreamingMessage(
    body: ChatRequestBody & { id?: string, agentId?: string },
    callbacks: StreamingCallbacks
  ): Promise<void> {
    const { messages: rendererMessages, agentId } = body
    
    // Set the chat ID in the LlmToolService for permission tracking
    if (body.id) {
      this.llmToolService.setCurrentChatId(body.id)
    }

    try {
      const { processedMessages, finalSystemPrompt } =
        await this.prepareMessagesAndSystemPrompt(rendererMessages, body.id, agentId)

      if (!processedMessages || processedMessages.length === 0) {
        if (!finalSystemPrompt) {
          // Only error if there's no system prompt to guide an empty message list either
          console.error(
            '[ChatService] No messages or system prompt for streaming after preparation step.'
          )
          callbacks.onError(
            new Error('No messages or system prompt for streaming after preparation.')
          )
          callbacks.onComplete()
          return
        }
      }

      const activeProvider = await this.settingsService.getActiveLLMProvider()
      let llm: LanguageModel | undefined = undefined

      if (!activeProvider) {
        console.error('[ChatService] No active LLM provider configured.')
        callbacks.onError(new Error('No active LLM provider configured.'))
        callbacks.onComplete()
        return
      }
      console.log(`[ChatService] Active provider for streaming: ${activeProvider}`)

      console.log(
        '[ChatService] Streaming messages from renderer:',
        JSON.stringify(rendererMessages, null, 2)
      )

      console.log(
        '[ChatService] Converted to CoreMessages:',
        JSON.stringify(processedMessages, null, 2)
      )

      // Configure LLM based on active provider (same code as handleSendMessageStream)
      switch (activeProvider) {
        case 'openai':
          const openaiConfig = await this.settingsService.getOpenAIConfig()
          if (!openaiConfig?.apiKey || !openaiConfig.model) {
            throw new Error('OpenAI provider is not configured correctly.')
          }
          const customOpenAI = createOpenAI({ apiKey: openaiConfig.apiKey })
          llm = customOpenAI.chat(openaiConfig.model as any)
          console.log(`[ChatService] Using OpenAI model: ${openaiConfig.model}`)
          break
        case 'google':
          const googleConfig = await this.settingsService.getGoogleConfig()
          if (!googleConfig?.apiKey || !googleConfig.model) {
            throw new Error('Google provider is not configured correctly.')
          }
          const customGoogleProvider = createGoogleGenerativeAI({ apiKey: googleConfig.apiKey })
          llm = customGoogleProvider(googleConfig.model as any)
          console.log(`[ChatService] Using Google model: ${googleConfig.model}`)
          break
        case 'azure':
          const azureConfig = await this.settingsService.getAzureConfig()
          if (!azureConfig?.apiKey || !azureConfig.endpoint || !azureConfig.deploymentName) {
            throw new Error('Azure OpenAI provider is not configured correctly.')
          }
          const configuredAzure = createAzure({
            apiKey: azureConfig.apiKey,
            baseURL: azureConfig.endpoint,
            apiVersion: '2024-04-01-preview'
          })
          llm = configuredAzure.chat(azureConfig.deploymentName)
          console.log(
            `[ChatService] Using Azure deployment: ${azureConfig.deploymentName} on endpoint ${azureConfig.endpoint}`
          )
          break
        case 'anthropic':
          const anthropicConfig = await this.settingsService.getAnthropicConfig()
          if (!anthropicConfig?.apiKey || !anthropicConfig.model) {
            throw new Error('Anthropic provider is not configured correctly.')
          }
          const customAnthropic = createAnthropic({ apiKey: anthropicConfig.apiKey })
          llm = customAnthropic.messages(anthropicConfig.model as any)
          console.log(`[ChatService] Using Anthropic model: ${anthropicConfig.model}`)
          break
        case 'vertex':
          const vertexConfig = await this.settingsService.getVertexConfig()
          if (
            !vertexConfig?.apiKey ||
            !vertexConfig.project ||
            !vertexConfig.location ||
            !vertexConfig.model
          ) {
            throw new Error('Vertex AI provider is not configured correctly.')
          }
          let credentialsJson: any = undefined
          try {
            if (vertexConfig.apiKey.trim().startsWith('{')) {
              credentialsJson = JSON.parse(vertexConfig.apiKey)
            }
          } catch (e) {
            console.error(
              '[ChatService] Failed to parse Vertex API key as JSON, proceeding assuming Application Default Credentials or direct key support:',
              e
            )
          }
          const vertexProvider = createVertex({
            ...(credentialsJson ? { googleAuthOptions: { credentials: credentialsJson } } : {}),
            project: vertexConfig.project,
            location: vertexConfig.location
          })
          llm = vertexProvider(vertexConfig.model as any)
          console.log(
            `[ChatService] Using Vertex AI model: ${vertexConfig.model} in project ${vertexConfig.project} at ${vertexConfig.location}`
          )
          break
        case 'ollama':
          const ollamaConfig = await this.settingsService.getOllamaConfig()
          if (!ollamaConfig?.baseURL || !ollamaConfig.model) {
            throw new Error('Ollama provider is not configured correctly.')
          }
          const customOllama = createOllama({
            baseURL: ollamaConfig.baseURL
          })
          llm = customOllama(ollamaConfig.model as any)
          console.log(
            `[ChatService] Using Ollama model: ${ollamaConfig.model} via ${ollamaConfig.baseURL}`
          )
          break
        default:
          throw new Error(`Unsupported LLM provider: ${activeProvider}`)
      }

      if (!llm) {
        throw new Error('LLM model could not be initialized.')
      }

      // Get ALL tool definitions from LlmToolService (includes built-in and assimilated MCP tools)
      const combinedTools = this.llmToolService.getToolDefinitionsForLLM()
      console.log(
        '[ChatService] Combined tools from LlmToolService for streaming LLM:',
        Object.keys(combinedTools)
      )

      // Set up streamText options
      const streamTextOptions: Parameters<typeof streamText>[0] = {
        model: llm,
        messages: processedMessages,
        system: finalSystemPrompt || '',
        ...(Object.keys(combinedTools).length > 0 && { tools: combinedTools }),
        maxSteps: MAX_LLM_STEPS,
        toolCallStreaming: true, // Enable tool call streaming
        onFinish: async (event) => {
          console.log('[ChatService] Streaming LLM finished.', event)
          // MCP Client cleanup is no longer directly managed here.
          // if (activeMcpClientsForVercelSDK.length > 0) {
          //   console.log('[ChatService] Closing Vercel MCP clients after successful stream finish.')
          //   await cleanupVercelMcpClients(activeMcpClientsForVercelSDK)
          //   activeMcpClientsForVercelSDK = [] // Clear the array
          // }
        }
      }

      // Execute the streamText call and handle stream events in real-time
      const result = await streamText(streamTextOptions)

      // Instead of directly iterating result.fullStream, use toDataStreamResponse() and adapt
      // For the IPC bridge, we manually send Uint8Array chunks.
      const reader = result
        .toDataStreamResponse({
          getErrorMessage: (error) => {
            if (error == null) {
              return 'unknown error'
            }
            if (typeof error === 'string') {
              return error
            }
            if (error instanceof Error) {
              return error.message
            }
            return JSON.stringify(error)
          }
        })
        .body?.getReader() // Get a reader for the data stream
      if (!reader) {
        throw new Error('Could not get reader from data stream response.')
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          console.log('[ChatService] Data stream finished reading.')
          break
        }
        if (value) {
          // value is Uint8Array, send it as a chunk
          console.log('[ChatService] Real-time data chunk (Uint8Array), length:', value.byteLength)
          callbacks.onChunk(value)
        }
      }

      console.log('[ChatService] Real-time stream completed successfully.')
      callbacks.onComplete()
    } catch (error) {
      console.error('[ChatService] Error in real-time streaming:', error)
      callbacks.onError(
        error instanceof Error ? error : new Error('Unknown error in streaming handler')
      )
      callbacks.onComplete()
    } finally {
      // Clean up MCP clients if they weren't already - No longer managed directly here.
      // if (activeMcpClientsForVercelSDK.length > 0) {
      //   console.warn('[ChatService] Closing Vercel MCP clients in finally block (streaming).')
      //   await cleanupVercelMcpClients(activeMcpClientsForVercelSDK)
      // }
    }
  }
}
