/**
 * Types and interfaces for the modular agent system
 */

import { LLMProviderType } from '../ipc-types'

/**
 * Agent capability definition for advertising specific abilities
 */
export interface AgentCapability {
  id: string
  name: string
  description: string
  tools: string[] // Tool IDs this capability requires
  exampleTasks?: string[] // Example tasks this capability can handle
}

/**
 * Agent type enum to distinguish between system and user-defined agents
 */
export type AgentType = 'system' | 'user-defined'

/**
 * Context strategy determines how conversation history is managed
 */
export type ContextStrategy = 'full' | 'summary' | 'windowed'

/**
 * Relationship type defines how agents functionally interact with each other
 * using modern agentic workflow terminology
 */
export interface AgentRelationship {
  agentId: string
  relationshipType:
    | 'orchestrates'
    | 'supervised_by'
    | 'collaborates_with'
    | 'evaluates'
    | 'routes_to'
    | 'receives_from'
}

/**
 * Memory configuration for agent's conversation history
 */
export interface AgentMemoryConfig {
  historyRetention: number // Number of messages to retain
  contextStrategy: ContextStrategy
  summaryInterval?: number // Number of messages before creating summary
}

/**
 * Prompt module reference in agent definition
 */
export interface AgentPromptModuleRef {
  moduleId: string
  parameters?: Record<string, string> // Dynamic parameters for this module
}

/**
 * Complete prompt configuration for an agent
 */
export interface AgentPromptConfig {
  coreModules: AgentPromptModuleRef[] // Base persona and capabilities
  taskModules?: AgentPromptModuleRef[] // Task-specific instructions
  agentModules: AgentPromptModuleRef[] // Agent-specific behaviors
  ruleModules?: AgentPromptModuleRef[] // Constraint and permission modules
}

/**
 * Model configuration for the agent
 */
export interface AgentModelConfig {
  provider: LLMProviderType
  model: string
  parameters?: {
    temperature?: number
    topP?: number
    maxOutputTokens?: number
    frequencyPenalty?: number
    presencePenalty?: number
    [key: string]: any
  }
}

/**
 * Agent role type to distinguish between orchestrators and specialized agents
 */
export type AgentRole = 'orchestrator' | 'specialist'

/**
 * Complete agent definition
 */
export interface AgentDefinition {
  id: string
  name: string
  description: string
  type: AgentType
  role?: AgentRole // Explicit role designation
  icon?: string
  capabilities: AgentCapability[]
  promptConfig: AgentPromptConfig
  modelConfig: AgentModelConfig
  toolAccess: string[] // Tool IDs this agent can access
  memoryConfig?: AgentMemoryConfig
  relationships?: AgentRelationship[]
  createdAt: string
  updatedAt: string
  createdBy?: string // User ID or system
}

/**
 * Agent creation parameters (without auto-generated fields)
 */
export type CreateAgentParams = Omit<AgentDefinition, 'id' | 'createdAt' | 'updatedAt'>

/**
 * Agent update parameters
 */
export type UpdateAgentParams = Partial<Omit<AgentDefinition, 'id' | 'createdAt' | 'updatedAt'>>

/**
 * Agent execution state
 */
export type AgentExecutionState = 'idle' | 'running' | 'paused' | 'completed' | 'error'

/**
 * Agent execution context
 */
export interface AgentExecutionContext {
  agentId: string
  chatId: string
  sessionId: string
  state: AgentExecutionState
  createdAt: string
  completedAt?: string
  error?: string
}

/**
 * Agent registry entry (lightweight representation for UI)
 */
export interface AgentRegistryEntry {
  id: string
  name: string
  description: string
  type: AgentType
  icon?: string
  capabilities: string[] // Just capability IDs for lightweight representation
  provider: LLMProviderType
  model: string
  createdAt: string
  updatedAt: string
}

/**
 * Simple prompt module types
 */
export type PromptModuleType = 'core' | 'task' | 'agent' | 'rule'

/**
 * Simple prompt module reference for IPC
 */
export interface PromptModuleReference {
  id: string
  type: PromptModuleType
  name: string
  description: string
  parameters?: string[] // Parameter names available for substitution
}

/**
 * Lightweight prompt module info for lists and dropdowns
 */
export interface PromptModuleInfo {
  id: string
  name: string
  description: string
  type: PromptModuleType
  version: string
  parameters?: string[]
}
