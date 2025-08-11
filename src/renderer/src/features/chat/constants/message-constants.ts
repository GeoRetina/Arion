/**
 * Constants for message part rendering
 */

export const COMPONENT_TYPES = {
  TEXT: 'text',
  TOOL_INVOCATION: 'tool-invocation',
  REASONING: 'reasoning'
} as const

export const TOOL_STATES = {
  RESULT: 'result',
  ERROR: 'error',
  LOADING: 'loading',
  PARTIAL_CALL: 'partial-call',
  CALL: 'call'
} as const

export const TOOL_STATUS = {
  LOADING: 'loading',
  COMPLETED: 'completed',
  ERROR: 'error'
} as const

/**
 * Tool name for calling/delegating to specialized agents
 * Note: This must match CALL_AGENT_TOOL_NAME in main process constants
 */
export const CALL_AGENT_TOOL_NAME = 'call_agent'

export type ComponentType = (typeof COMPONENT_TYPES)[keyof typeof COMPONENT_TYPES]
export type ToolState = (typeof TOOL_STATES)[keyof typeof TOOL_STATES]
export type ToolStatus = (typeof TOOL_STATUS)[keyof typeof TOOL_STATUS]
