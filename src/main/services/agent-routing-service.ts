import { v4 as uuidv4 } from 'uuid'
import { AgentRegistryService } from './agent-registry-service'
import { ChatService } from './chat-service'
import { LlmToolService } from './llm-tool-service'
import { CoreMessage } from 'ai'
import type { AgentDefinition } from '../../shared/types/agent-types'
import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'

/**
 * Represents an analysis of a user query for task routing
 */
export interface TaskAnalysis {
  taskType: string
  requiredCapabilities: string[]
  complexity: 'simple' | 'moderate' | 'complex'
  domainContext?: string
  estimatedSubtasks?: number
}

/**
 * Represents a selected agent for a task or subtask
 */
export interface AgentSelection {
  agentId: string
  confidence: number // 0-1 confidence score
  matchedCapabilities: string[]
}

/**
 * Represents a subtask in a decomposed task
 */
export interface Subtask {
  id: string
  description: string
  requiredCapabilities: string[]
  dependencies: string[] // IDs of subtasks this depends on
  status: 'pending' | 'assigned' | 'in_progress' | 'completed' | 'failed'
  assignedAgentId?: string
  result?: string
}

/**
 * Represents an execution context for orchestrating multiple agents
 */
export interface AgentExecutionContext {
  chatId: string
  sessionId: string
  orchestratorAgentId: string
  originalQuery: string
  subtasks: Subtask[]
  sharedMemory: Map<string, any>
  results: Map<string, any>
  status: 'preparing' | 'executing' | 'completed' | 'failed'
  createdAt: string
  completedAt?: string
  error?: string
}

/**
 * Result of an orchestration process
 */
export interface OrchestrationResult {
  sessionId: string
  finalResponse: string
  subtasksExecuted: number
  agentsInvolved: string[]
  completionTime: number // milliseconds
}

/**
 * Service for intelligent agent routing and orchestration
 */
export class AgentRoutingService {
  private agentRegistryService: AgentRegistryService
  private chatService: ChatService
  private llmToolService: LlmToolService
  private initialized = false
  private executionContexts: Map<string, AgentExecutionContext> = new Map()
  private promptsBasePath: string

  constructor(
    agentRegistryService: AgentRegistryService,
    chatService: ChatService,
    llmToolService: LlmToolService
  ) {
    this.agentRegistryService = agentRegistryService
    this.chatService = chatService
    this.llmToolService = llmToolService
    
    // Set prompts base path
    this.promptsBasePath = path.join(app.getAppPath(), 'src', 'main', 'prompts')
    
    console.log('[AgentRoutingService] Constructed with prompts path:', this.promptsBasePath)
  }

  /**
   * Initialize the routing service
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    console.log('[AgentRoutingService] Initializing...')
    
    // Ensure dependent services are initialized
    // These services will handle their own initialization if needed
    await this.agentRegistryService.initialize()
    // chatService and llmToolService are expected to be initialized by the main process

    this.initialized = true
    console.log('[AgentRoutingService] Initialized successfully')
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
    console.log(`[AgentRoutingService] Orchestrating task with agent ${orchestratorAgentId}`)

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
          console.log(`[AgentRoutingService] No suitable agent found for subtask, falling back to orchestrator: ${subtask.description}`)
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
      subtasks.forEach(subtask => {
        if (subtask.assignedAgentId) {
          agentsInvolved.add(subtask.assignedAgentId)
        }
      })
      
      const result: OrchestrationResult = {
        sessionId,
        finalResponse: finalResult,
        subtasksExecuted: subtasks.length,
        agentsInvolved: Array.from(agentsInvolved),
        completionTime: Date.now() - startTime
      }
      
      console.log(`[AgentRoutingService] Task orchestration completed in ${result.completionTime}ms`)
      return result
      
    } catch (error) {
      console.error('[AgentRoutingService] Error orchestrating task:', error)
      throw error
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
    console.log(`[AgentRoutingService] Created execution context ${sessionId} for chat ${chatId}`)
    return sessionId
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
      console.error(`[AgentRoutingService] Error loading prompt ${promptName}:`, error)
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
    console.log(`[AgentRoutingService] Decomposing task: ${query}`)
    
    // First analyze the query to determine if task decomposition is needed
    const taskAnalysis = await this.analyzeQuery(query, orchestratorAgentId, chatId)
    
    // If the task is simple, return a single subtask
    if (taskAnalysis.complexity === 'simple') {
      console.log('[AgentRoutingService] Task is simple, no decomposition needed')
      const subtask: Subtask = {
        id: uuidv4(),
        description: query,
        requiredCapabilities: taskAnalysis.requiredCapabilities,
        dependencies: [],
        status: 'pending'
      }
      return [subtask]
    }
    
    // For moderate or complex tasks, use the orchestrator to decompose
    const decompositionPrompt = await this.loadPrompt('task-decomposition', {
      query
    })
    
    // Execute the orchestrator agent with the decomposition prompt
    const agent = await this.agentRegistryService.getAgentById(orchestratorAgentId)
    if (!agent) {
      throw new Error(`Orchestrator agent ${orchestratorAgentId} not found`)
    }
    
    // Use the chat service to get a response from the orchestrator agent
    const result = await this.executeAgentWithPrompt(
      orchestratorAgentId,
      chatId,
      decompositionPrompt
    )
    
    try {
      // Extract JSON from the result
      const jsonMatch = result.match(/\[[\s\S]*\]/m)
      if (!jsonMatch) {
        throw new Error('Could not extract JSON subtasks from LLM response')
      }
      
      const parsedSubtasks = JSON.parse(jsonMatch[0])
      
      // Convert to our Subtask interface
      const subtasks: Subtask[] = parsedSubtasks.map((st: any) => ({
        id: uuidv4(),
        description: st.description,
        requiredCapabilities: st.requiredCapabilities || [],
        dependencies: st.dependencies?.map((depId: string | number) => {
          // Handle case where dependencies might be numeric indices
          if (typeof depId === 'number') {
            return parsedSubtasks[depId - 1]?.id || ''
          }
          return depId
        }).filter((id: string) => id !== '') || [],
        status: 'pending'
      }))
      
      console.log(`[AgentRoutingService] Decomposed task into ${subtasks.length} subtasks`)
      return subtasks
    } catch (error) {
      console.error('[AgentRoutingService] Error parsing subtasks:', error)
      // Fallback to a single task if parsing fails
      return [{
        id: uuidv4(),
        description: query,
        requiredCapabilities: taskAnalysis.requiredCapabilities,
        dependencies: [],
        status: 'pending'
      }]
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
    console.log(`[AgentRoutingService] Analyzing query: ${query}`)
    
    // Load the analysis prompt from XML file
    const analysisPrompt = await this.loadPrompt('task-analysis', {
      query
    })
    
    // Use the agent to analyze the query
    const result = await this.executeAgentWithPrompt(agentId, chatId, analysisPrompt)
    
    try {
      // Extract JSON from the result
      const jsonMatch = result.match(/\{[\s\S]*\}/m)
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
      
      console.log(`[AgentRoutingService] Query analysis:`, analysis)
      return analysis
    } catch (error) {
      console.error('[AgentRoutingService] Error analyzing query:', error)
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
    console.log(`[AgentRoutingService] Selecting agent for subtask: ${subtask.description}`)
    
    // Get all available agents
    const allAgents = await this.agentRegistryService.getAllAgents()
    
    if (allAgents.length === 0) {
      console.warn('[AgentRoutingService] No agents available for selection')
      return null
    }
    
    // Filter out the orchestrator itself to avoid recursion, unless no other agent is available
    const candidateAgents = allAgents.filter(agent => agent.id !== orchestratorAgentId)
    
    if (candidateAgents.length === 0) {
      console.warn('[AgentRoutingService] Only the orchestrator agent is available')
      return {
        agentId: orchestratorAgentId,
        confidence: 1,
        matchedCapabilities: []
      }
    }
    
    // Score each agent based on capability match
    const scoredAgents = await Promise.all(
      candidateAgents.map(async agent => {
        const agentDef = await this.agentRegistryService.getAgentById(agent.id)
        if (!agentDef) {
          return { agent, score: 0, matchedCapabilities: [] }
        }
        
        const matchedCapabilities = this.matchCapabilities(
          subtask.requiredCapabilities,
          agentDef
        )
        
        // Calculate score based on capability match percentage
        const capabilityScore = subtask.requiredCapabilities.length > 0
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
      console.log(`[AgentRoutingService] Selected agent ${bestAgent.agent.name} with score ${bestAgent.score}`)
      return {
        agentId: bestAgent.agent.id,
        confidence: bestAgent.score,
        matchedCapabilities: bestAgent.matchedCapabilities
      }
    }
    
    // If no good match found, return null
    console.warn('[AgentRoutingService] No suitable agent found for subtask')
    return null
  }

  /**
   * Match required capabilities against agent capabilities
   */
  private matchCapabilities(
    requiredCapabilities: string[],
    agent: AgentDefinition
  ): string[] {
    const matchedCapabilities: string[] = []
    
    // If no capabilities required, consider it a match
    if (requiredCapabilities.length === 0) {
      return matchedCapabilities
    }
    
    // Check each required capability
    for (const required of requiredCapabilities) {
      // Check if any agent capability matches (by ID or name)
      const match = agent.capabilities.some(cap => 
        cap.id === required || 
        cap.name.toLowerCase() === required.toLowerCase()
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
    
    console.log(`[AgentRoutingService] Executing ${context.subtasks.length} subtasks for session ${sessionId}`)
    
    // Create a map of subtasks by ID for easier access
    const subtasksById = new Map<string, Subtask>()
    context.subtasks.forEach(subtask => {
      subtasksById.set(subtask.id, subtask)
    })
    
    // Track completed subtasks
    const completedSubtasks = new Set<string>()
    
    // Function to check if all dependencies are satisfied for a subtask
    const areDependenciesMet = (subtask: Subtask): boolean => {
      if (subtask.dependencies.length === 0) {
        return true
      }
      
      return subtask.dependencies.every(depId => completedSubtasks.has(depId))
    }
    
    // Execute until all subtasks are completed or failed
    while (completedSubtasks.size < context.subtasks.length) {
      // Find subtasks that can be executed (all dependencies met)
      const executableSubtasks = context.subtasks.filter(subtask => 
        subtask.status === 'assigned' && 
        areDependenciesMet(subtask) &&
        !completedSubtasks.has(subtask.id)
      )
      
      // If no executable subtasks, we might be stuck due to cyclic dependencies
      if (executableSubtasks.length === 0) {
        const pendingSubtasks = context.subtasks.filter(subtask => 
          subtask.status !== 'completed' && subtask.status !== 'failed'
        )
        
        if (pendingSubtasks.length === 0) {
          // All subtasks are complete or failed
          break
        } else {
          // We're stuck - likely a dependency cycle
          console.error('[AgentRoutingService] Dependency cycle detected in subtasks')
          throw new Error('Could not execute subtasks due to dependency cycle')
        }
      }
      
      // Execute subtasks in parallel where possible
      const subtaskPromises = executableSubtasks.map(async subtask => {
        try {
          subtask.status = 'in_progress'
          console.log(`[AgentRoutingService] Executing subtask: ${subtask.description}`)
          
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
          const subtaskPrompt = await this.loadPrompt('subtask-execution', {
            original_query: context.originalQuery,
            subtask_description: subtask.description,
            dependency_context: dependencyContext
          })
          
          // Execute the agent with the subtask prompt
          const result = await this.executeAgentWithPrompt(
            subtask.assignedAgentId!,
            context.chatId,
            subtaskPrompt
          )
          
          // Store the result
          subtask.result = result
          context.results.set(subtask.id, result)
          subtask.status = 'completed'
          completedSubtasks.add(subtask.id)
          
          console.log(`[AgentRoutingService] Subtask completed: ${subtask.id}`)
        } catch (error) {
          console.error(`[AgentRoutingService] Error executing subtask ${subtask.id}:`, error)
          subtask.status = 'failed'
          subtask.result = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
          completedSubtasks.add(subtask.id) // Mark as processed even though it failed
        }
      })
      
      // Wait for this batch of subtasks to complete
      await Promise.all(subtaskPromises)
    }
    
    console.log(`[AgentRoutingService] All subtasks executed for session ${sessionId}`)
  }

  /**
   * Synthesize results from all subtasks into a final response
   */
  private async synthesizeResults(
    sessionId: string,
    orchestratorAgentId: string
  ): Promise<string> {
    const context = this.executionContexts.get(sessionId)
    if (!context) {
      throw new Error(`Execution context ${sessionId} not found`)
    }
    
    console.log(`[AgentRoutingService] Synthesizing results for session ${sessionId}`)
    
    // Get all subtask results
    const subtaskResults = context.subtasks.map(subtask => ({
      description: subtask.description,
      status: subtask.status,
      result: subtask.result || 'No result'
    }))
    
    // Use orchestrator agent to synthesize results
    const synthesisPrompt = await this.loadPrompt('result-synthesis', {
      query: context.originalQuery,
      subtask_results: JSON.stringify(subtaskResults, null, 2)
    })
    
    // Execute the orchestrator agent with the synthesis prompt
    const finalResult = await this.executeAgentWithPrompt(
      orchestratorAgentId,
      context.chatId,
      synthesisPrompt
    )
    
    console.log(`[AgentRoutingService] Results synthesized for session ${sessionId}`)
    return finalResult
  }

  /**
   * Execute an agent with a specific prompt and return the result
   */
  private async executeAgentWithPrompt(
    agentId: string,
    chatId: string,
    prompt: string
  ): Promise<string> {
    console.log(`[AgentRoutingService] Executing agent ${agentId} with prompt`)
    
    // Create artificial message history for the request
    const messages: CoreMessage[] = [
      { role: 'user', content: prompt }
    ]
    
    try {
      // Use the chat service to execute the agent
      // We're using the internal method that collects all chunks
      const result = await this.chatService.handleSendMessageStream({
        messages,
        id: chatId,
        agentId
      })
      
      // Convert the Uint8Array chunks to a single string
      const textDecoder = new TextDecoder()
      let resultText = ''
      
      for (const chunk of result) {
        resultText += textDecoder.decode(chunk)
      }
      
      return resultText
    } catch (error) {
      console.error('[AgentRoutingService] Error executing agent with prompt:', error)
      throw error
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
}