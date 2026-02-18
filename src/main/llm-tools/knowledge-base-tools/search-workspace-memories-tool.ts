import { z } from 'zod'

export const searchWorkspaceMemoriesToolName = 'search_workspace_memories'

export const SearchWorkspaceMemoriesParamsSchema = z.object({
  query: z
    .string()
    .describe(
      'Semantic search query for prior workspace context such as previous decisions, tasks, outcomes, dates, or user preferences.'
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(10)
    .optional()
    .describe('Maximum number of memory matches to return. Defaults to 5.')
})
export type SearchWorkspaceMemoriesParams = z.infer<typeof SearchWorkspaceMemoriesParamsSchema>

export const searchWorkspaceMemoriesToolDefinition = {
  description:
    'Searches captured workspace memories across chats using semantic similarity and recency ranking. Use this before answering questions about prior work, decisions, outcomes, dates, preferences, or TODOs.',
  inputSchema: SearchWorkspaceMemoriesParamsSchema
}

export interface SearchWorkspaceMemoriesResult {
  status: 'success' | 'error' | 'no_results'
  message: string
  results?: Array<{
    id: string
    summary: string
    scope: 'chat' | 'global'
    memoryType: 'session_outcome' | 'tool_outcome'
    createdAt: string
    score?: number
    source: string
  }>
}
