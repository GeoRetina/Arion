import { CoreMessage } from 'ai'
import type { Subtask, AgentExecutionContext } from '../types/orchestration-types'
import { IExecutionManager, IPromptManager, IAgentSelector } from './types/orchestration-interfaces'
import { AgentExecutionResult } from './types/execution-types'
import { ChatService } from '../chat-service'

export class ExecutionManager implements IExecutionManager {
  private currentlyExecutingAgents: Map<string, string> = new Map()

  constructor(
    private chatService: ChatService,
    private promptManager: IPromptManager,
    private agentSelector: IAgentSelector
  ) {}

  public getCurrentExecutingAgent(chatId: string): string | undefined {
    return this.currentlyExecutingAgents.get(chatId)
  }

  public async executeAgentWithPrompt(
    agentId: string,
    chatId: string,
    prompt: string
  ): Promise<AgentExecutionResult> {
    // Track the currently executing agent for this chat
    this.currentlyExecutingAgents.set(chatId, agentId)

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
        toolResults: result.toolResults.map((tr) => ({
          toolCallId: tr.toolCallId,
          toolName: tr.toolName,
          args: tr.args,
          result: tr.result
        })),
        success: result.success,
        error: result.error
      }
    } catch (error) {
      return {
        textResponse: '',
        toolResults: [],
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error in agent execution'
      }
    } finally {
      // Clear the executing agent tracking when done
      this.currentlyExecutingAgents.delete(chatId)
    }
  }

  public async executeSubtasks(sessionId: string, context: AgentExecutionContext): Promise<void> {
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
          throw new Error('Could not execute subtasks due to dependency cycle')
        }
      }

      // Execute subtasks in parallel where possible
      const subtaskPromises = executableSubtasks.map(async (subtask) => {
        try {
          subtask.status = 'in_progress'

          // Include results from dependencies in the prompt
          let dependencyContext = ''
          if (subtask.dependencies.length > 0) {
            dependencyContext = 'Results from previous subtasks:\\n\\n'
            for (const depId of subtask.dependencies) {
              const depResult = context.results.get(depId)
              const depSubtask = subtasksById.get(depId)
              if (depResult && depSubtask) {
                dependencyContext += `Task "${depSubtask.description}":\\n${depResult}\\n\\n`
              }
            }
          }

          // Create prompt with context
          // Get available agents info
          const agentsInfo = await this.agentSelector.getAvailableAgentsInfo()

          const subtaskPrompt = await this.promptManager.loadPrompt('subtask-execution', {
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
          }

          subtask.status = 'completed'
          completedSubtasks.add(subtask.id)
        } catch (error) {
          subtask.status = 'failed'
          subtask.result = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
          completedSubtasks.add(subtask.id) // Mark as processed even though it failed
        }
      })

      // Wait for this batch of subtasks to complete
      await Promise.all(subtaskPromises)
    }
  }
}
