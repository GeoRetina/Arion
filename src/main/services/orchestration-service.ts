import { v4 as uuidv4 } from 'uuid'
import { AgentRegistryService } from './agent-registry-service'
import { ChatService } from './chat-service'
import { LlmToolService } from './llm-tool-service'
import { CoreMessage } from 'ai'
import type { AgentDefinition } from '../../shared/types/agent-types'
import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'
import {
  type TaskAnalysis,
  type AgentSelection,
  type Subtask,
  type AgentExecutionContext,
  type OrchestrationResult,
  type AgentExecutionResult
} from './types/orchestration-types'

/**
 * Service for intelligent agent routing and orchestration
 */
export class OrchestrationService {
  private agentRegistryService: AgentRegistryService
  private chatService: ChatService
  // LlmToolService might be useful in future extensions
  private initialized = false
  private executionContexts: Map<string, AgentExecutionContext> = new Map()
  private promptsBasePath: string
  private currentlyExecutingAgents: Map<string, string> = new Map() // Maps chatId to agentId

  constructor(
    agentRegistryService: AgentRegistryService,
    chatService: ChatService,
    _llmToolService: LlmToolService // Unused parameter, prefixed with underscore
  ) {
    this.agentRegistryService = agentRegistryService
    this.chatService = chatService

    // Set prompts base path
    this.promptsBasePath = path.join(app.getAppPath(), 'src', 'main', 'prompts')

    console.log('[OrchestrationService] Constructed with prompts path:', this.promptsBasePath)
  }

  /**
   * Initialize the routing service
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    console.log('[OrchestrationService] Initializing...')

    // Ensure dependent services are initialized
    // These services will handle their own initialization if needed
    await this.agentRegistryService.initialize()
    // chatService and llmToolService are expected to be initialized by the main process

    this.initialized = true
    console.log('[OrchestrationService] Initialized successfully')
  }

  /**
   * Main method to orchestrate a task using multiple agents
   */
  public async orchestrateTask(
    query: string,
    chatId: string,
    orchestratorAgentId: string
  ): Promise<OrchestrationResult> {
    await this.ensureInitialized()
    console.log(`[OrchestrationService] Orchestrating task with model/agent ${orchestratorAgentId}`)

    const startTime = Date.now()

    try {
      // 1. Create execution context
      const sessionId = await this.createExecutionContext(chatId, query, orchestratorAgentId)

      // 2. Analyze and decompose task
      const subtasks = await this.decomposeTask(query, orchestratorAgentId, chatId)

      // 3. Update execution context with subtasks
      const context = this.executionContexts.get(sessionId)!
      context.subtasks = subtasks
      context.status = 'executing'

      // 4. Select agents for subtasks based on capabilities
      for (const subtask of subtasks) {
        const selectedAgent = await this.selectAgentForSubtask(subtask, orchestratorAgentId)
        subtask.assignedAgentId = selectedAgent?.agentId

        if (subtask.assignedAgentId) {
          subtask.status = 'assigned'
        } else {
          // Fallback to orchestrator if no suitable agent found
          subtask.assignedAgentId = orchestratorAgentId
          subtask.status = 'assigned'
          console.log(
            `[OrchestrationService] No suitable agent found for subtask, falling back to orchestrator: ${subtask.description}`
          )
        }
      }

      // 5. Execute subtasks in dependency order
      await this.executeSubtasks(sessionId)

      // 6. Synthesize results
      const finalResult = await this.synthesizeResults(sessionId, orchestratorAgentId)

      // 7. Mark context as completed
      context.status = 'completed'
      context.completedAt = new Date().toISOString()

      // 8. Create result object
      const agentsInvolved = new Set<string>()
      subtasks.forEach((subtask) => {
        if (subtask.assignedAgentId) {
          agentsInvolved.add(subtask.assignedAgentId)
        }
      })

      // Get agent names for subtasks
      for (const subtask of subtasks) {
        if (subtask.assignedAgentId) {
          const agent = await this.agentRegistryService.getAgentById(subtask.assignedAgentId)
          if (agent) {
            subtask.assignedAgentName = agent.name
          }
        }
      }

      const result: OrchestrationResult = {
        sessionId,
        finalResponse: finalResult,
        subtasks: subtasks, // Include subtasks for UI display
        subtasksExecuted: subtasks.length,
        agentsInvolved: Array.from(agentsInvolved),
        completionTime: Date.now() - startTime,
        success: true
      }

      console.log(
        `[OrchestrationService] Task orchestration completed in ${result.completionTime}ms`
      )
      return result
    } catch (error) {
      console.error('[OrchestrationService] Error orchestrating task:', error)
      return {
        sessionId: '', // Empty session ID for error case
        finalResponse:
          error instanceof Error ? `Error: ${error.message}` : 'An unknown error occurred',
        subtasks: [],
        subtasksExecuted: 0,
        agentsInvolved: [],
        completionTime: Date.now() - startTime,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error in orchestration'
      }
    }
  }

  /**
   * Create a new execution context for orchestration
   */
  private async createExecutionContext(
    chatId: string,
    query: string,
    orchestratorAgentId: string
  ): Promise<string> {
    const sessionId = uuidv4()
    const now = new Date().toISOString()

    const context: AgentExecutionContext = {
      chatId,
      sessionId,
      orchestratorAgentId,
      originalQuery: query,
      subtasks: [],
      sharedMemory: new Map(),
      results: new Map(),
      status: 'preparing',
      createdAt: now
    }

    this.executionContexts.set(sessionId, context)
    console.log(`[OrchestrationService] Created execution context ${sessionId} for chat ${chatId}`)
    return sessionId
  }

  /**
   * Get a formatted list of available agents and their capabilities
   */
  private async getAvailableAgentsInfo(): Promise<string> {
    try {
      const allAgents = await this.agentRegistryService.getAllAgents()
      let agentInfoText = 'AVAILABLE SPECIALIZED AGENTS:\n\n'

      for (const agentEntry of allAgents) {
        const agentDef = await this.agentRegistryService.getAgentById(agentEntry.id)
        if (!agentDef) continue

        // Skip agents that are orchestrators (to avoid recursion)
        const isOrchestrator = agentDef.capabilities.some(
          (cap) =>
            cap.name.toLowerCase().includes('orchestrat') ||
            cap.description.toLowerCase().includes('orchestrat')
        )

        if (!isOrchestrator) {
          const capabilitiesList = agentDef.capabilities
            .map((cap) => `- ${cap.name}: ${cap.description}`)
            .join('\n')

          agentInfoText += `Agent: ${agentDef.name} (ID: ${agentDef.id})\n`
          agentInfoText += `Description: ${agentDef.description || 'No description'}\n`
          agentInfoText += `Capabilities:\n${capabilitiesList}\n\n`
        }
      }

      return agentInfoText
    } catch (error) {
      console.error('[OrchestrationService] Error getting agent information:', error)
      return 'Error: Could not retrieve agent information.'
    }
  }

  /**
   * Load a prompt from an XML file and replace placeholders
   */
  private async loadPrompt(
    promptName: string,
    replacements: Record<string, string>
  ): Promise<string> {
    try {
      const promptPath = path.join(this.promptsBasePath, `${promptName}.xml`)
      const promptXml = fs.readFileSync(promptPath, 'utf8')

      // Extract the content between CDATA tags
      const cdataMatch = promptXml.match(/<!\[CDATA\[([\s\S]*?)\]\]>/m)
      if (!cdataMatch) {
        throw new Error(`Could not extract CDATA from prompt file: ${promptName}`)
      }

      let promptTemplate = cdataMatch[1]

      // Replace placeholders with values
      Object.entries(replacements).forEach(([key, value]) => {
        const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g')
        promptTemplate = promptTemplate.replace(placeholder, value)
      })

      return promptTemplate
    } catch (error) {
      console.error(`[OrchestrationService] Error loading prompt ${promptName}:`, error)
      // If prompt loading fails, return empty string or some default text
      return `Unable to load prompt ${promptName}. Please provide a response.`
    }
  }

  /**
   * Use the orchestrator agent to decompose a task into subtasks
   */
  private async decomposeTask(
    query: string,
    orchestratorAgentId: string,
    chatId: string
  ): Promise<Subtask[]> {
    console.log(`[OrchestrationService] Decomposing task: ${query}`)

    // First analyze the query to determine if task decomposition is needed
    const taskAnalysis = await this.analyzeQuery(query, orchestratorAgentId, chatId)

    // If the task is simple, return a single subtask
    if (taskAnalysis.complexity === 'simple') {
      console.log('[OrchestrationService] Task is simple, no decomposition needed')
      const subtask: Subtask = {
        id: uuidv4(),
        description: query,
        requiredCapabilities: taskAnalysis.requiredCapabilities,
        dependencies: [],
        status: 'pending'
      }
      return [subtask]
    }

    // Get available agents info
    const agentsInfo = await this.getAvailableAgentsInfo()

    // For moderate or complex tasks, use the orchestrator to decompose
    const decompositionPrompt = await this.loadPrompt('task-decomposition', {
      query,
      agents_info: agentsInfo
    })

    // Execute the orchestrator agent with the decomposition prompt
    const agent = await this.agentRegistryService.getAgentById(orchestratorAgentId)
    if (!agent) {
      throw new Error(`Orchestrator agent ${orchestratorAgentId} not found`)
    }

    // Use the chat service to get a response from the orchestrator agent
    const executionResult = await this.executeAgentWithPrompt(
      orchestratorAgentId,
      chatId,
      decompositionPrompt
    )

    if (!executionResult.success) {
      console.error('[OrchestrationService] Error in task decomposition:', executionResult.error)
      // Fallback to a single task
      return [{
        id: uuidv4(),
        description: query,
        requiredCapabilities: taskAnalysis.requiredCapabilities,
        dependencies: [],
        status: 'pending'
      }]
    }

    try {
      // Extract JSON from the text result
      const jsonMatch = executionResult.textResponse.match(/\[[\s\S]*\]/m)
      if (!jsonMatch) {
        throw new Error('Could not extract JSON subtasks from LLM response')
      }

      const parsedSubtasks = JSON.parse(jsonMatch[0])

      // Convert to our Subtask interface
      const subtasks: Subtask[] = parsedSubtasks.map((st: any) => ({
        id: uuidv4(),
        description: st.description,
        requiredCapabilities: st.requiredCapabilities || [],
        dependencies:
          st.dependencies
            ?.map((depId: string | number) => {
              // Handle case where dependencies might be numeric indices
              if (typeof depId === 'number') {
                return parsedSubtasks[depId - 1]?.id || ''
              }
              return depId
            })
            .filter((id: string) => id !== '') || [],
        status: 'pending'
      }))

      console.log(`[OrchestrationService] Decomposed task into ${subtasks.length} subtasks`)
      return subtasks
    } catch (error) {
      console.error('[OrchestrationService] Error parsing subtasks:', error)
      // Fallback to a single task if parsing fails
      return [
        {
          id: uuidv4(),
          description: query,
          requiredCapabilities: taskAnalysis.requiredCapabilities,
          dependencies: [],
          status: 'pending'
        }
      ]
    }
  }

  /**
   * Analyze a query to determine task characteristics
   */
  private async analyzeQuery(
    query: string,
    agentId: string,
    chatId: string
  ): Promise<TaskAnalysis> {
    console.log(`[OrchestrationService] Analyzing query: ${query}`)

    // Get available agents info
    const agentsInfo = await this.getAvailableAgentsInfo()

    // Load the analysis prompt from XML file
    const analysisPrompt = await this.loadPrompt('task-analysis', {
      query,
      agents_info: agentsInfo
    })

    // Use the agent to analyze the query
    const executionResult = await this.executeAgentWithPrompt(agentId, chatId, analysisPrompt)

    if (!executionResult.success) {
      console.error('[OrchestrationService] Error in query analysis:', executionResult.error)
      // Return default analysis if execution failed
      return {
        taskType: 'unknown',
        requiredCapabilities: [],
        complexity: 'moderate',
        estimatedSubtasks: 1
      }
    }

    try {
      // Extract JSON from the text result
      const jsonMatch = executionResult.textResponse.match(/\{[\s\S]*\}/m)
      if (!jsonMatch) {
        throw new Error('Could not extract JSON analysis from LLM response')
      }

      const analysis = JSON.parse(jsonMatch[0]) as TaskAnalysis

      // Validate analysis
      if (!analysis.taskType || !analysis.requiredCapabilities || !analysis.complexity) {
        throw new Error('Incomplete task analysis')
      }

      // Ensure complexity is one of the allowed values
      if (!['simple', 'moderate', 'complex'].includes(analysis.complexity)) {
        analysis.complexity = 'moderate' // Default to moderate if invalid
      }

      console.log(`[OrchestrationService] Query analysis:`, analysis)
      return analysis
    } catch (error) {
      console.error('[OrchestrationService] Error analyzing query:', error)
      // Return default analysis if parsing fails
      return {
        taskType: 'unknown',
        requiredCapabilities: [],
        complexity: 'moderate',
        estimatedSubtasks: 1
      }
    }
  }

  /**
   * Select the most appropriate agent for a subtask
   */
  private async selectAgentForSubtask(
    subtask: Subtask,
    orchestratorAgentId: string
  ): Promise<AgentSelection | null> {
    console.log(`[OrchestrationService] Selecting agent for subtask: ${subtask.description}`)

    // Get all available agents
    const allAgents = await this.agentRegistryService.getAllAgents()

    if (allAgents.length === 0) {
      console.warn('[OrchestrationService] No agents available for selection')
      return null
    }

    // Filter out the orchestrator itself to avoid recursion, unless no other agent is available
    const candidateAgents = allAgents.filter((agent) => agent.id !== orchestratorAgentId)

    if (candidateAgents.length === 0) {
      console.warn('[OrchestrationService] Only the orchestrator agent is available')
      return {
        agentId: orchestratorAgentId,
        confidence: 1,
        matchedCapabilities: []
      }
    }

    // Score each agent based on capability match
    const scoredAgents = await Promise.all(
      candidateAgents.map(async (agent) => {
        const agentDef = await this.agentRegistryService.getAgentById(agent.id)
        if (!agentDef) {
          return { agent, score: 0, matchedCapabilities: [] }
        }

        const matchedCapabilities = this.matchCapabilities(subtask.requiredCapabilities, agentDef)

        // Calculate score based on capability match percentage
        const capabilityScore =
          subtask.requiredCapabilities.length > 0
            ? matchedCapabilities.length / subtask.requiredCapabilities.length
            : 0.5 // Default score if no capabilities specified

        return {
          agent,
          score: capabilityScore,
          matchedCapabilities
        }
      })
    )

    // Sort by score (highest first)
    scoredAgents.sort((a, b) => b.score - a.score)

    // Select the highest scoring agent with at least some capability match
    const bestAgent = scoredAgents[0]
    if (bestAgent && bestAgent.score > 0) {
      console.log(
        `[OrchestrationService] Selected agent ${bestAgent.agent.name} with score ${bestAgent.score}`
      )
      return {
        agentId: bestAgent.agent.id,
        confidence: bestAgent.score,
        matchedCapabilities: bestAgent.matchedCapabilities
      }
    }

    // If no good match found, return null
    console.warn('[OrchestrationService] No suitable agent found for subtask')
    return null
  }

  /**
   * Match required capabilities against agent capabilities
   */
  private matchCapabilities(requiredCapabilities: string[], agent: AgentDefinition): string[] {
    const matchedCapabilities: string[] = []

    // If no capabilities required, consider it a match
    if (requiredCapabilities.length === 0) {
      return matchedCapabilities
    }

    // Check each required capability
    for (const required of requiredCapabilities) {
      // Check if any agent capability matches (by ID or name)
      const match = agent.capabilities.some(
        (cap) => cap.id === required || cap.name.toLowerCase() === required.toLowerCase()
      )

      if (match) {
        matchedCapabilities.push(required)
      }
    }

    return matchedCapabilities
  }

  /**
   * Execute subtasks in dependency order
   */
  private async executeSubtasks(sessionId: string): Promise<void> {
    const context = this.executionContexts.get(sessionId)
    if (!context) {
      throw new Error(`Execution context ${sessionId} not found`)
    }

    console.log(
      `[OrchestrationService] Executing ${context.subtasks.length} subtasks for session ${sessionId}`
    )

    // Create a map of subtasks by ID for easier access
    const subtasksById = new Map<string, Subtask>()
    context.subtasks.forEach((subtask) => {
      subtasksById.set(subtask.id, subtask)
    })

    // Track completed subtasks
    const completedSubtasks = new Set<string>()

    // Function to check if all dependencies are satisfied for a subtask
    const areDependenciesMet = (subtask: Subtask): boolean => {
      if (subtask.dependencies.length === 0) {
        return true
      }

      return subtask.dependencies.every((depId) => completedSubtasks.has(depId))
    }

    // Execute until all subtasks are completed or failed
    while (completedSubtasks.size < context.subtasks.length) {
      // Find subtasks that can be executed (all dependencies met)
      const executableSubtasks = context.subtasks.filter(
        (subtask) =>
          subtask.status === 'assigned' &&
          areDependenciesMet(subtask) &&
          !completedSubtasks.has(subtask.id)
      )

      // If no executable subtasks, we might be stuck due to cyclic dependencies
      if (executableSubtasks.length === 0) {
        const pendingSubtasks = context.subtasks.filter(
          (subtask) => subtask.status !== 'completed' && subtask.status !== 'failed'
        )

        if (pendingSubtasks.length === 0) {
          // All subtasks are complete or failed
          break
        } else {
          // We're stuck - likely a dependency cycle
          console.error('[OrchestrationService] Dependency cycle detected in subtasks')
          throw new Error('Could not execute subtasks due to dependency cycle')
        }
      }

      // Execute subtasks in parallel where possible
      const subtaskPromises = executableSubtasks.map(async (subtask) => {
        try {
          subtask.status = 'in_progress'
          console.log(`[OrchestrationService] Executing subtask: ${subtask.description}`)

          // Include results from dependencies in the prompt
          let dependencyContext = ''
          if (subtask.dependencies.length > 0) {
            dependencyContext = 'Results from previous subtasks:\n\n'
            for (const depId of subtask.dependencies) {
              const depResult = context.results.get(depId)
              const depSubtask = subtasksById.get(depId)
              if (depResult && depSubtask) {
                dependencyContext += `Task "${depSubtask.description}":\n${depResult}\n\n`
              }
            }
          }

          // Create prompt with context
          // Get available agents info
          const agentsInfo = await this.getAvailableAgentsInfo()

          const subtaskPrompt = await this.loadPrompt('subtask-execution', {
            original_query: context.originalQuery,
            subtask_description: subtask.description,
            dependency_context: dependencyContext,
            agents_info: agentsInfo
          })

          // Execute the agent with the subtask prompt
          const executionResult = await this.executeAgentWithPrompt(
            subtask.assignedAgentId!,
            context.chatId,
            subtaskPrompt
          )

          if (!executionResult.success) {
            console.error(`[OrchestrationService] Error executing subtask ${subtask.id}:`, executionResult.error)
            subtask.status = 'failed'
            subtask.result = `Error: ${executionResult.error}`
            completedSubtasks.add(subtask.id)
            return
          }

          // Store both text result and tool results for potential later use
          subtask.result = executionResult.textResponse
          context.results.set(subtask.id, executionResult.textResponse)
          
          // Store tool results in shared memory if they exist
          if (executionResult.toolResults && executionResult.toolResults.length > 0) {
            context.sharedMemory.set(`${subtask.id}_toolResults`, executionResult.toolResults)
            console.log(`[OrchestrationService] Stored ${executionResult.toolResults.length} tool results for subtask ${subtask.id}`)
          }
          
          subtask.status = 'completed'
          completedSubtasks.add(subtask.id)

          console.log(`[OrchestrationService] Subtask completed: ${subtask.id}`)
        } catch (error) {
          console.error(`[OrchestrationService] Error executing subtask ${subtask.id}:`, error)
          subtask.status = 'failed'
          subtask.result = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
          completedSubtasks.add(subtask.id) // Mark as processed even though it failed
        }
      })

      // Wait for this batch of subtasks to complete
      await Promise.all(subtaskPromises)
    }

    console.log(`[OrchestrationService] All subtasks executed for session ${sessionId}`)
  }

  /**
   * Synthesize results from all subtasks into a final response
   */
  private async synthesizeResults(sessionId: string, orchestratorAgentId: string): Promise<string> {
    const context = this.executionContexts.get(sessionId)
    if (!context) {
      throw new Error(`Execution context ${sessionId} not found`)
    }

    console.log(`[OrchestrationService] Synthesizing results for session ${sessionId}`)

    // Get all subtask results
    const subtaskResults = context.subtasks.map((subtask) => ({
      description: subtask.description,
      status: subtask.status,
      result: subtask.result || 'No result'
    }))

    // Get available agents info
    const agentsInfo = await this.getAvailableAgentsInfo()

    // Use orchestrator agent to synthesize results
    const synthesisPrompt = await this.loadPrompt('result-synthesis', {
      query: context.originalQuery,
      subtask_results: JSON.stringify(subtaskResults, null, 2),
      agents_info: agentsInfo
    })

    // Execute the orchestrator agent with the synthesis prompt
    const executionResult = await this.executeAgentWithPrompt(
      orchestratorAgentId,
      context.chatId,
      synthesisPrompt
    )

    if (!executionResult.success) {
      console.error('[OrchestrationService] Error in result synthesis:', executionResult.error)
      return `Error synthesizing results: ${executionResult.error}`
    }

    console.log(`[OrchestrationService] Results synthesized for session ${sessionId}`)
    return executionResult.textResponse
  }

  /**
   * Execute an agent with a specific prompt and return the result
   */
  /**
   * Get the currently executing agent for a chat session
   * @param chatId The chat ID to check
   * @returns The agent ID currently executing in this chat, or undefined if none
   */
  public getCurrentExecutingAgent(chatId: string): string | undefined {
    return this.currentlyExecutingAgents.get(chatId)
  }

  public async executeAgentWithPrompt(
    agentId: string,
    chatId: string,
    prompt: string
  ): Promise<AgentExecutionResult> {
    console.log(`[OrchestrationService] Executing agent ${agentId} with prompt`)

    // Track the currently executing agent for this chat
    this.currentlyExecutingAgents.set(chatId, agentId)
    console.log(
      `[OrchestrationService] Set current executing agent for chat ${chatId} to ${agentId}`
    )

    // Create artificial message history for the request
    const messages: CoreMessage[] = [{ role: 'user', content: prompt }]

    try {
      // Use the new structured execution method to capture both text and tool results
      const result = await this.chatService.executeAgentWithStructuredResult(
        messages,
        chatId,
        agentId
      )

      return {
        textResponse: result.textResponse,
        toolResults: result.toolResults.map(tr => ({
          toolCallId: tr.toolCallId,
          toolName: tr.toolName,
          args: tr.args,
          result: tr.result
        })),
        success: result.success,
        error: result.error
      }
    } catch (error) {
      console.error('[OrchestrationService] Error executing agent with prompt:', error)
      return {
        textResponse: '',
        toolResults: [],
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error in agent execution'
      }
    } finally {
      // Clear the executing agent tracking when done
      this.currentlyExecutingAgents.delete(chatId)
      console.log(`[OrchestrationService] Cleared current executing agent for chat ${chatId}`)
    }
  }

  /**
   * Get the status of orchestration sessions
   */
  public async getOrchestrationStatus(
    sessionId?: string
  ): Promise<{
    success: boolean
    activeSessions?: string[]
    subtasks?: Record<string, Subtask[]>
    error?: string
  }> {
    await this.ensureInitialized()

    try {
      if (sessionId) {
        // Get a specific session
        const context = this.executionContexts.get(sessionId)
        if (!context) {
          return {
            success: false,
            error: `Session ${sessionId} not found`
          }
        }

        return {
          success: true,
          activeSessions: [sessionId],
          subtasks: { [sessionId]: context.subtasks }
        }
      } else {
        // Get all active sessions
        const activeSessionIds = Array.from(this.executionContexts.keys())
        const subtasks: Record<string, Subtask[]> = {}

        // Populate subtasks for each session
        for (const id of activeSessionIds) {
          const context = this.executionContexts.get(id)!
          subtasks[id] = context.subtasks
        }

        return {
          success: true,
          activeSessions: activeSessionIds,
          subtasks
        }
      }
    } catch (error) {
      console.error('[OrchestrationService] Error getting orchestration status:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error getting status'
      }
    }
  }

  /**
   * Ensure the service is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize()
    }
  }

  public getExecutionContext(sessionId: string) {
    return this.executionContexts.get(sessionId)
  }
}
