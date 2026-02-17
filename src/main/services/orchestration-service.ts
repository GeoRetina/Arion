import { AgentRegistryService } from './agent-registry-service'
import { ChatService } from './chat-service'
import { LlmToolService } from './llm-tool-service'
import type { OrchestrationResult } from './types/orchestration-types'

import { PromptManager } from './orchestration/prompt-manager'
import { TaskAnalyzer } from './orchestration/task-analyzer'
import { AgentSelector } from './orchestration/agent-selector'
import { ExecutionManager } from './orchestration/execution-manager'
import { ResultSynthesizer } from './orchestration/result-synthesizer'
import { ExecutionContextManager } from './orchestration/execution-context-manager'
import type { AgentExecutionResult } from './orchestration/types/execution-types'

/**
 * Main orchestration service that coordinates multiple specialized agents
 * to handle complex tasks through task decomposition and agent routing
 */
export class OrchestrationService {
  private initialized = false

  // Component services
  private promptManager: PromptManager
  private taskAnalyzer: TaskAnalyzer
  private agentSelector: AgentSelector
  private executionManager: ExecutionManager
  private resultSynthesizer: ResultSynthesizer
  private contextManager: ExecutionContextManager

  constructor(
    private agentRegistryService: AgentRegistryService,
    private chatService: ChatService,
    llmToolService: LlmToolService
  ) {
    void llmToolService
    // Initialize component services
    this.promptManager = new PromptManager()
    this.agentSelector = new AgentSelector(this.agentRegistryService)
    this.contextManager = new ExecutionContextManager()
    this.executionManager = new ExecutionManager(
      this.chatService,
      this.promptManager,
      this.agentSelector
    )
    this.taskAnalyzer = new TaskAnalyzer(
      this.promptManager,
      this.agentSelector,
      this.executionManager
    )
    this.resultSynthesizer = new ResultSynthesizer(
      this.promptManager,
      this.agentSelector,
      this.executionManager
    )
  }

  /**
   * Initialize the orchestration service
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    // Ensure dependent services are initialized
    await this.agentRegistryService.initialize()
    // chatService and llmToolService are expected to be initialized by the main process

    this.initialized = true
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

    const startTime = Date.now()

    try {
      // 1. Create execution context
      const sessionId = await this.contextManager.createExecutionContext(
        chatId,
        query,
        orchestratorAgentId
      )

      // 2. Analyze and decompose task
      const subtasks = await this.taskAnalyzer.decomposeTask(query, orchestratorAgentId, chatId)

      // 3. Update execution context with subtasks
      const context = this.contextManager.getExecutionContext(sessionId)!
      context.subtasks = subtasks
      context.status = 'executing'

      // 4. Select agents for subtasks based on capabilities
      for (const subtask of subtasks) {
        const selectedAgent = await this.agentSelector.selectAgentForSubtask(
          subtask,
          orchestratorAgentId
        )
        subtask.assignedAgentId = selectedAgent?.agentId

        if (subtask.assignedAgentId) {
          subtask.status = 'assigned'
        } else {
          // Fallback to orchestrator if no suitable agent found
          subtask.assignedAgentId = orchestratorAgentId
          subtask.status = 'assigned'
        }
      }

      // 5. Execute subtasks in dependency order
      await this.executionManager.executeSubtasks(sessionId, context)

      // 6. Synthesize results
      const finalResult = await this.resultSynthesizer.synthesizeResults(
        sessionId,
        context,
        orchestratorAgentId
      )

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

      return result
    } catch (error) {
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
   * Get the currently executing agent for a chat session
   */
  public getCurrentExecutingAgent(chatId: string): string | undefined {
    return this.executionManager.getCurrentExecutingAgent(chatId)
  }

  /**
   * Execute an agent with a specific prompt and return the result
   * Used by tools that need to delegate tasks to agents
   */
  public async executeAgentWithPrompt(
    agentId: string,
    chatId: string,
    prompt: string
  ): Promise<AgentExecutionResult> {
    await this.ensureInitialized()
    return this.executionManager.executeAgentWithPrompt(agentId, chatId, prompt)
  }

  /**
   * Get the status of orchestration sessions
   */
  public async getOrchestrationStatus(sessionId?: string) {
    await this.ensureInitialized()
    return this.contextManager.getOrchestrationStatus(sessionId)
  }

  /**
   * Get execution context for a session
   */
  public getExecutionContext(sessionId: string) {
    return this.contextManager.getExecutionContext(sessionId)
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
