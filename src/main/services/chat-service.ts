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
import { AgentRegistryService } from './agent-registry-service'

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
  private agentRegistryService?: AgentRegistryService

  constructor(
    settingsService: SettingsService, 
    llmToolService: LlmToolService,
    modularPromptManager: ModularPromptManager,
    agentRegistryService?: AgentRegistryService
  ) {
    this.settingsService = settingsService
    this.llmToolService = llmToolService
    this.modularPromptManager = modularPromptManager
    this.agentRegistryService = agentRegistryService
    console.log('[ChatService] Initialized with LlmToolService and optional AgentRegistryService')
  }

  /**
   * Create an LLM instance based on agent-specific configuration or fall back to global settings
   * @param agentId Optional agent ID to get model configuration for
   * @returns Promise<LanguageModel> configured for the agent or global settings
   */
  private async createLLMFromAgentConfig(agentId?: string): Promise<LanguageModel> {
    let provider: string
    let model: string

    // Try to get agent-specific configuration first
    if (agentId && this.agentRegistryService) {
      try {
        const agent = await this.agentRegistryService.getAgentById(agentId)
        if (agent?.modelConfig) {
          // Validate agent model configuration
          const modelConfig = agent.modelConfig
          if (!modelConfig.provider || !modelConfig.model) {
            console.warn(`[ChatService] Agent ${agentId} has incomplete modelConfig (provider: ${modelConfig.provider}, model: ${modelConfig.model}), falling back to global settings`)
            provider = await this.settingsService.getActiveLLMProvider() || ''
            model = await this.getGlobalModelForProvider(provider)
          } else {
            provider = modelConfig.provider
            model = modelConfig.model
            console.log(`[ChatService] Using agent-specific LLM config for ${agentId}: ${provider}/${model}`)
            
            // Validate that the provider is supported
            const supportedProviders = ['openai', 'google', 'azure', 'anthropic', 'vertex', 'ollama']
            if (!supportedProviders.includes(provider.toLowerCase())) {
              console.warn(`[ChatService] Agent ${agentId} has unsupported provider '${provider}', falling back to global settings`)
              provider = await this.settingsService.getActiveLLMProvider() || ''
              model = await this.getGlobalModelForProvider(provider)
            }
          }
        } else {
          console.log(`[ChatService] Agent ${agentId} not found or has no modelConfig, falling back to global settings`)
          // Fall back to global settings
          provider = await this.settingsService.getActiveLLMProvider() || ''
          model = await this.getGlobalModelForProvider(provider)
        }
      } catch (error) {
        console.error(`[ChatService] Error getting agent config for ${agentId}, falling back to global settings:`, error)
        // Fall back to global settings
        provider = await this.settingsService.getActiveLLMProvider() || ''
        model = await this.getGlobalModelForProvider(provider)
      }
    } else {
      // Use global settings
      provider = await this.settingsService.getActiveLLMProvider() || ''
      model = await this.getGlobalModelForProvider(provider)
      console.log(`[ChatService] Using global LLM config: ${provider}/${model}`)
    }

    if (!provider) {
      throw new Error('No LLM provider configured (neither agent-specific nor global)')
    }

    if (!model) {
      throw new Error(`No LLM model configured for provider '${provider}' (neither agent-specific nor global)`)
    }

    // Create LLM based on provider
    switch (provider) {
      case 'openai':
        const openaiConfig = await this.settingsService.getOpenAIConfig()
        if (!openaiConfig?.apiKey) {
          throw new Error('OpenAI provider is not configured correctly.')
        }
        const customOpenAI = createOpenAI({ apiKey: openaiConfig.apiKey })
        return customOpenAI.chat(model as any)

      case 'google':
        const googleConfig = await this.settingsService.getGoogleConfig()
        if (!googleConfig?.apiKey) {
          throw new Error('Google provider is not configured correctly.')
        }
        const customGoogleProvider = createGoogleGenerativeAI({ apiKey: googleConfig.apiKey })
        return customGoogleProvider(model as any)

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
        return configuredAzure.chat(model || azureConfig.deploymentName)

      case 'anthropic':
        const anthropicConfig = await this.settingsService.getAnthropicConfig()
        if (!anthropicConfig?.apiKey) {
          throw new Error('Anthropic provider is not configured correctly.')
        }
        const customAnthropic = createAnthropic({ apiKey: anthropicConfig.apiKey })
        return customAnthropic.messages(model as any)

      case 'vertex':
        const vertexConfig = await this.settingsService.getVertexConfig()
        if (!vertexConfig?.apiKey || !vertexConfig.project || !vertexConfig.location) {
          throw new Error('Vertex AI provider is not configured correctly.')
        }
        let credentialsJson: any = undefined
        try {
          if (vertexConfig.apiKey.trim().startsWith('{')) {
            credentialsJson = JSON.parse(vertexConfig.apiKey)
          }
        } catch (e) {
          console.error('[ChatService] Failed to parse Vertex API key as JSON:', e)
        }
        const vertexProvider = createVertex({
          ...(credentialsJson ? { googleAuthOptions: { credentials: credentialsJson } } : {}),
          project: vertexConfig.project,
          location: vertexConfig.location
        })
        return vertexProvider(model as any)

      case 'ollama':
        const ollamaConfig = await this.settingsService.getOllamaConfig()
        if (!ollamaConfig?.baseURL) {
          throw new Error('Ollama provider is not configured correctly.')
        }
        const customOllama = createOllama({
          baseURL: ollamaConfig.baseURL
        })
        return customOllama(model as any)

      default:
        throw new Error(`Unsupported LLM provider: ${provider}`)
    }
  }

  /**
   * Helper method to get the global model name for a given provider
   */
  private async getGlobalModelForProvider(provider: string): Promise<string> {
    switch (provider) {
      case 'openai':
        const openaiConfig = await this.settingsService.getOpenAIConfig()
        return openaiConfig?.model || ''
      case 'google':
        const googleConfig = await this.settingsService.getGoogleConfig()
        return googleConfig?.model || ''
      case 'azure':
        const azureConfig = await this.settingsService.getAzureConfig()
        return azureConfig?.deploymentName || ''
      case 'anthropic':
        const anthropicConfig = await this.settingsService.getAnthropicConfig()
        return anthropicConfig?.model || ''
      case 'vertex':
        const vertexConfig = await this.settingsService.getVertexConfig()
        return vertexConfig?.model || ''
      case 'ollama':
        const ollamaConfig = await this.settingsService.getOllamaConfig()
        return ollamaConfig?.model || ''
      default:
        return ''
    }
  }
  
  /**
   * Get a list of tools that are assigned to specialized (non-orchestrator) agents
   * @returns Array of tool IDs that are assigned to specialized agents
   */
  /**
   * Get tools that are specifically assigned to specialized agents
   * @returns Array of tool IDs that are assigned to specialized agents
   */
  private async getToolsAssignedToSpecializedAgents(): Promise<string[]> {
    if (!this.agentRegistryService) {
      console.log('[ChatService] No agent registry service available')
      return []
    }
    
    try {
      // Get all agents
      const allAgents = await this.agentRegistryService.getAllAgents()
      const specializedAgentTools: string[] = []
      
      // Process each agent
      for (const agentEntry of allAgents) {
        const agent = await this.agentRegistryService.getAgentById(agentEntry.id)
        if (!agent) continue
        
        // Skip orchestrators
        const isOrchestrator = agent.capabilities.some(cap => 
          cap.name.toLowerCase().includes('orchestrat') ||
          cap.description.toLowerCase().includes('orchestrat')
        )
        
        if (!isOrchestrator) {
          // Add all tools assigned to this specialized agent
          if (agent.toolAccess && agent.toolAccess.length > 0) {
            specializedAgentTools.push(...agent.toolAccess)
          }
        }
      }
      
      // Return unique tool IDs
      const uniqueTools = [...new Set(specializedAgentTools)]
      console.log(`[ChatService] Found ${uniqueTools.length} unique tools assigned to specialized agents`)
      return uniqueTools
    } catch (error) {
      console.error('[ChatService] Error getting tools assigned to specialized agents:', error)
      return []
    }
  }
  
  /**
   * Get appropriate tools for an agent based on agent type (orchestrator vs specialized)
   * @param agentId Optional agent ID to get tools for. If not provided, treats as main orchestrator.
   * @returns Object containing tool definitions suitable for the agent
   */
  private async getToolsForAgent(agentId?: string): Promise<Record<string, any>> {
    let combinedTools: Record<string, any> = {};
    
    // Get ALL tools first
    const allTools = this.llmToolService.getToolDefinitionsForLLM();
    
    // Case 1: Specific agent is provided
    if (agentId && this.agentRegistryService) {
      const agent = await this.agentRegistryService.getAgentById(agentId);
      console.log(`[ChatService] Found agent for ID ${agentId}:`, agent ? `${agent.name} with ${agent.capabilities.length} capabilities` : 'null');
      
      if (agent?.capabilities) {
        console.log(`[ChatService] Agent capabilities:`, agent.capabilities.map(cap => `${cap.name}: ${cap.description}`).join(', '));
      }
      
      // Determine if this is an orchestrator
      const isOrchestrator = agent?.capabilities.some(cap => 
        cap.name.toLowerCase().includes('orchestrat') ||
        cap.description.toLowerCase().includes('orchestrat')
      );
      
      console.log(`[ChatService] Agent ${agentId} isOrchestrator: ${isOrchestrator}`);
      
      if (isOrchestrator) {
        console.log('[ChatService] Agent is an orchestrator - filtering available tools');
        // For orchestrator: Filter out tools assigned to specialized agents
        const specializedAgentTools = await this.getToolsAssignedToSpecializedAgents();
        
        // Filter out tools that are assigned to specialized agents
        combinedTools = Object.fromEntries(
          Object.entries(allTools).filter(([toolName]) => !specializedAgentTools.includes(toolName))
        );
        
        console.log(
          '[ChatService] Filtered tools for orchestrator:',
          Object.keys(combinedTools),
          'Excluded specialized agent tools:',
          specializedAgentTools
        );
      } else if (agent) {
        // For specialized agents: Use only their assigned tools
        console.log('[ChatService] Using assigned tools for specialized agent:', agent.toolAccess || []);
        
        if (agent.toolAccess && agent.toolAccess.length > 0) {
          // Get tools with the agent's specific tool access list
          const agentTools = this.llmToolService.getToolDefinitionsForLLM(agent.toolAccess);
          
          // Only exclude send_to_agent tool for specialized agents (to prevent recursion)
          combinedTools = Object.fromEntries(
            Object.entries(agentTools).filter(([toolName]) => 
              toolName !== 'send_to_agent' // Explicitly prevent specialized agents from calling send_to_agent
            )
          );
          
          if (agent.toolAccess.includes('send_to_agent')) {
            console.log('[ChatService] Removed send_to_agent tool from specialized agent to prevent recursion');
          }
          
          console.log('[ChatService] Providing these tools to specialized agent:', Object.keys(combinedTools));
          
          // Verify that the required tools are actually present
          const missingTools = agent.toolAccess.filter(toolName => 
            !Object.keys(combinedTools).includes(toolName) && toolName !== 'send_to_agent'
          );
          
          if (missingTools.length > 0) {
            console.warn(`[ChatService] WARNING: Some assigned tools are missing for agent ${agent.name} (${agentId}): ${missingTools.join(', ')}`);
            console.warn(`[ChatService] This might cause the agent to try using send_to_agent as a fallback to access these tools`);
          }
        } else {
          combinedTools = {}; // No tools assigned to this agent
          console.log('[ChatService] No tools assigned to specialized agent');
        }
      } else {
        // Agent not found, fall back to default tools
        console.warn(`[ChatService] Agent with ID ${agentId} not found, using default tool filtering`);
        return await this.getToolsForAgent(); // Recursive call without agentId to get default tools
      }
    } else {
      // Case 2: No agent ID provided - treat as main orchestrator
      console.log('[ChatService] No agent ID provided - treating as main orchestrator');
      
      // Get tools that are specifically assigned to specialized agents
      const specializedAgentTools = await this.getToolsAssignedToSpecializedAgents();
      
      // Filter out tools that are assigned to specialized agents
      combinedTools = Object.fromEntries(
        Object.entries(allTools).filter(([toolName]) => !specializedAgentTools.includes(toolName))
      );
      
      console.log(
        '[ChatService] Filtered tools for main orchestrator:',
        Object.keys(combinedTools),
        'Excluded specialized agent tools:',
        specializedAgentTools
      );
    }
    
    // Warn if no tools are provided
    if (Object.keys(combinedTools).length === 0) {
      console.warn(`[ChatService] WARNING: No tools are being provided to the agent${agentId ? ` ${agentId}` : ''}!`);
    }
    
    return combinedTools;
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
      
      // Get available agents information if the registry is available
      let availableAgentsInfo = ''
      if (this.agentRegistryService) {
        try {
          console.log('[ChatService] Retrieving available agents info for system prompt')
          
          // Get all agents from the registry
          const allAgents = await this.agentRegistryService.getAllAgents()
          if (allAgents && allAgents.length > 0) {
            availableAgentsInfo = "\n\nAVAILABLE SPECIALIZED AGENTS:\n\n"
            
            // Process each agent to create a formatted agent info section
            for (const agentEntry of allAgents) {
              const agentDef = await this.agentRegistryService.getAgentById(agentEntry.id)
              if (!agentDef) continue
              
              // Skip agents that are orchestrators (to avoid recursion)
              const isOrchestrator = agentDef.capabilities.some(cap => 
                cap.name.toLowerCase().includes('orchestrat') ||
                cap.description.toLowerCase().includes('orchestrat')
              )
              
              if (!isOrchestrator) {
                const capabilitiesList = agentDef.capabilities
                  .map(cap => `- ${cap.name}: ${cap.description}`)
                  .join('\n')
                
                availableAgentsInfo += `Agent: ${agentDef.name} (ID: ${agentDef.id})\n`
                availableAgentsInfo += `Description: ${agentDef.description || 'No description'}\n`
                availableAgentsInfo += `Capabilities:\n${capabilitiesList}\n\n`
              }
            }
            console.log(`[ChatService] Found ${allAgents.length} agents to include in system prompt`)
          } else {
            console.log('[ChatService] No agents found in registry to include in system prompt')
          }
        } catch (error) {
          console.error('[ChatService] Error getting agent information for system prompt:', error)
        }
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
      
      // Add available agents info to the system prompt if we have any
      if (availableAgentsInfo) {
        finalSystemPrompt += availableAgentsInfo
        console.log('[ChatService] Added agent information to system prompt')
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

      // Create LLM using agent-specific configuration or global settings
      let llm: LanguageModel
      try {
        llm = await this.createLLMFromAgentConfig(agentId)
      } catch (error) {
        console.error('[ChatService] Error creating LLM:', error)
        streamChunks.push(
          textEncoder.encode(JSON.stringify({ 
            streamError: error instanceof Error ? error.message : 'Failed to create LLM'
          }))
        )
        return streamChunks
      }

      // Get appropriate tools for this agent (or main orchestrator if no agent ID)
      const combinedTools = await this.getToolsForAgent(agentId)

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

      console.log(
        '[ChatService] Streaming messages from renderer:',
        JSON.stringify(rendererMessages, null, 2)
      )

      console.log(
        '[ChatService] Converted to CoreMessages:',
        JSON.stringify(processedMessages, null, 2)
      )

      // Create LLM using agent-specific configuration or global settings
      let llm: LanguageModel
      try {
        llm = await this.createLLMFromAgentConfig(agentId)
      } catch (error) {
        console.error('[ChatService] Error creating LLM for streaming:', error)
        callbacks.onError(error instanceof Error ? error : new Error('Failed to create LLM'))
        callbacks.onComplete()
        return
      }

      // Get appropriate tools for this agent (or main orchestrator if no agent ID)
      const combinedTools = await this.getToolsForAgent(agentId)

      // Set up streamText options
      // Check if we have any tools to provide
      if (Object.keys(combinedTools).length === 0) {
        console.warn('[ChatService] WARNING: No tools are being provided to the agent!')
        if (agentId) {
          console.warn(`[ChatService] This might be a configuration issue with agent ${agentId}`)
        }
      }
      
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
