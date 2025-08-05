/**
 * Constants related to LLM interactions and configuration.
 */

/**
 * Maximum number of steps (including text generation and tool calls)
 * allowed in a single `streamText` call to prevent infinite loops.
 */
export const MAX_LLM_STEPS = 30

export const MAX_RAG_RESULTS = 3 // Number of chunks to retrieve for RAG context

/**
 * Default embedding dimensions, e.g., for OpenAI's text-embedding-3-large.
 */
export const EMBEDDING_DIMENSIONS = 1536

/**
 * Default embedding model ID, e.g., OpenAI's text-embedding-3-small.
 */
export const DEFAULT_EMBEDDING_MODEL_ID = 'text-embedding-3-small'

/**
 * Tool name for calling/delegating to specialized agents
 */
export const CALL_AGENT_TOOL_NAME = 'call_agent'
