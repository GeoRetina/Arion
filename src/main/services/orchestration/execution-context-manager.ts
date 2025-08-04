import { v4 as uuidv4 } from 'uuid'
import type { AgentExecutionContext, Subtask } from '../types/orchestration-types'
import { IExecutionContextManager } from './types/orchestration-interfaces'

export class ExecutionContextManager implements IExecutionContextManager {
  private executionContexts: Map<string, AgentExecutionContext> = new Map()

  public async createExecutionContext(
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
    return sessionId
  }

  public getExecutionContext(sessionId: string): AgentExecutionContext | undefined {
    return this.executionContexts.get(sessionId)
  }

  public updateExecutionContext(
    sessionId: string,
    updates: Partial<AgentExecutionContext>
  ): boolean {
    const context = this.executionContexts.get(sessionId)
    if (!context) {
      return false
    }

    // Apply updates
    Object.assign(context, updates)
    return true
  }

  public deleteExecutionContext(sessionId: string): boolean {
    const deleted = this.executionContexts.delete(sessionId)
    if (deleted) {
    } else {
    }
    return deleted
  }

  public async getOrchestrationStatus(sessionId?: string): Promise<{
    success: boolean
    activeSessions?: string[]
    subtasks?: Record<string, Subtask[]>
    error?: string
  }> {
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
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error getting status'
      }
    }
  }

  public getActiveSessionsCount(): number {
    return this.executionContexts.size
  }

  public clearAllContexts(): void {
    this.executionContexts.clear()
  }

  public getContextsByStatus(status: AgentExecutionContext['status']): AgentExecutionContext[] {
    return Array.from(this.executionContexts.values()).filter(
      (context) => context.status === status
    )
  }
}
