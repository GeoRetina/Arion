export interface AgentExecutionResult {
  textResponse: string
  toolResults: Array<{
    toolCallId: string
    toolName: string
    args: UnsafeAny
    result: UnsafeAny
  }>
  success: boolean
  error?: string
}

export interface SubtaskExecutionResult {
  subtaskId: string
  agentId: string
  textResponse: string
  toolResults?: Array<{
    toolCallId: string
    toolName: string
    args: UnsafeAny
    result: UnsafeAny
  }>
  success: boolean
  error?: string
  executionTimeMs: number
}

export interface ExecutionSession {
  sessionId: string
  chatId: string
  orchestratorAgentId: string
  originalQuery: string
  status: 'preparing' | 'executing' | 'completed' | 'failed'
  createdAt: string
  completedAt?: string
}

export interface ExecutionMetrics {
  totalExecutionTime: number
  subtasksExecuted: number
  agentsInvolved: string[]
  parallelExecutions: number
  dependencyResolutionTime: number
}
