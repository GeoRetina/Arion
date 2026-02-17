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
  assignedAgentName?: string // Add agent name for UI display
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
  sharedMemory: Map<string, UnsafeAny>
  results: Map<string, UnsafeAny>
  status: 'preparing' | 'executing' | 'completed' | 'failed'
  createdAt: string
  completedAt?: string
  error?: string
}

/**
 * Tool execution result from an agent
 */
export interface AgentToolResult {
  toolCallId: string
  toolName: string
  args: UnsafeAny
  result: UnsafeAny
}

/**
 * Enhanced result from agent execution that includes both text and tool results
 */
export interface AgentExecutionResult {
  textResponse: string
  toolResults: AgentToolResult[]
  success: boolean
  error?: string
}

/**
 * Result of an orchestration process
 */
export interface OrchestrationResult {
  sessionId: string
  finalResponse: string
  subtasks: Subtask[] // Include subtasks for UI display
  subtasksExecuted: number
  agentsInvolved: string[]
  completionTime: number // milliseconds
  success: boolean
  error?: string
}
