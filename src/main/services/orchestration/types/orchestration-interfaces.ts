import type {
  TaskAnalysis,
  AgentSelection,
  Subtask,
  AgentExecutionContext
} from '../../types/orchestration-types'
import type { AgentDefinition } from '../../../../shared/types/agent-types'
import { AgentExecutionResult } from './execution-types'

export interface IPromptManager {
  loadPrompt(promptName: string, replacements: Record<string, string>): Promise<string>
  getPromptsBasePath(): string
}

export interface ITaskAnalyzer {
  analyzeQuery(query: string, agentId: string, chatId: string): Promise<TaskAnalysis>
  decomposeTask(query: string, orchestratorAgentId: string, chatId: string): Promise<Subtask[]>
}

export interface IAgentSelector {
  selectAgentForSubtask(
    subtask: Subtask,
    orchestratorAgentId: string
  ): Promise<AgentSelection | null>
  matchCapabilities(requiredCapabilities: string[], agent: AgentDefinition): string[]
  getAvailableAgentsInfo(): Promise<string>
}

export interface IExecutionManager {
  executeSubtasks(sessionId: string, context: AgentExecutionContext): Promise<void>
  executeAgentWithPrompt(
    agentId: string,
    chatId: string,
    prompt: string
  ): Promise<AgentExecutionResult>
  getCurrentExecutingAgent(chatId: string): string | undefined
}

export interface IResultSynthesizer {
  synthesizeResults(
    sessionId: string,
    context: AgentExecutionContext,
    orchestratorAgentId: string
  ): Promise<string>
}

export interface IExecutionContextManager {
  createExecutionContext(
    chatId: string,
    query: string,
    orchestratorAgentId: string
  ): Promise<string>
  getExecutionContext(sessionId: string): AgentExecutionContext | undefined
  updateExecutionContext(sessionId: string, updates: Partial<AgentExecutionContext>): boolean
  deleteExecutionContext(sessionId: string): boolean
  getOrchestrationStatus(sessionId?: string): Promise<{
    success: boolean
    activeSessions?: string[]
    subtasks?: Record<string, Subtask[]>
    error?: string
  }>
}
