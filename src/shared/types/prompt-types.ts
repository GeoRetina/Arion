/**
 * Types and interfaces for the prompt module system
 */

/**
 * Type of prompt module
 */
export type PromptModuleType = 'core' | 'capability' | 'task' | 'agent' | 'rule'

/**
 * Condition operator for conditional inclusion logic
 */
export type ConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'greater_than'
  | 'less_than'
  | 'exists'
  | 'not_exists'

/**
 * Condition for conditional inclusion of a module or section
 */
export interface PromptCondition {
  field: string
  operator: ConditionOperator
  value?: UnsafeAny
}

/**
 * Complete prompt module definition
 */
export interface PromptModule {
  id: string
  name: string
  description: string
  type: PromptModuleType
  content: string
  parameters?: string[] // Parameter names that can be substituted in the content
  dependencies?: string[] // IDs of other modules this one depends on
  conditions?: PromptCondition[] // Conditions that must be met for this module to be included
  priority?: number // Module ordering priority when conflicts exist
  version: string
  createdAt: string
  updatedAt: string
  author?: string // Creator of this module
}

/**
 * Parameters for creating a new prompt module
 */
export type CreatePromptModuleParams = Omit<
  PromptModule,
  'id' | 'version' | 'createdAt' | 'updatedAt'
>

/**
 * Parameters for updating an existing prompt module
 */
export type UpdatePromptModuleParams = Partial<
  Omit<PromptModule, 'id' | 'version' | 'createdAt' | 'updatedAt'>
>

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

/**
 * Parameters for a module being used in a prompt
 */
export interface PromptModuleParameters {
  moduleId: string
  parameters: Record<string, string>
}

/**
 * Parameter definition with validation options
 */
export interface PromptParameterDefinition {
  name: string
  description: string
  required: boolean
  defaultValue?: string
  enum?: string[] // If provided, value must be one of these
  pattern?: string // Regex pattern to validate against
  minLength?: number
  maxLength?: number
}

/**
 * Prompt assembly request for composing the final system prompt
 */
export interface PromptAssemblyRequest {
  coreModules: PromptModuleParameters[]
  taskModules?: PromptModuleParameters[]
  agentModules: PromptModuleParameters[]
  ruleModules?: PromptModuleParameters[]
  context?: Record<string, UnsafeAny> // Additional context for condition evaluation
}

/**
 * Result of prompt assembly
 */
export interface PromptAssemblyResult {
  assembledPrompt: string
  includedModules: string[] // IDs of modules included in final prompt
  tokenCount: number // Estimated token count
  warnings?: string[] // Any warnings during assembly
}
