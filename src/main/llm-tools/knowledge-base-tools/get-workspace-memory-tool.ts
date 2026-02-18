import { z } from 'zod'

export const getWorkspaceMemoryToolName = 'get_workspace_memory'

export const GetWorkspaceMemoryParamsSchema = z.object({
  memoryId: z.string().describe('Memory identifier returned by search_workspace_memories.'),
  includeDetails: z
    .boolean()
    .optional()
    .describe('Include structured details payload when available. Defaults to true.')
})
export type GetWorkspaceMemoryParams = z.infer<typeof GetWorkspaceMemoryParamsSchema>

export const getWorkspaceMemoryToolDefinition = {
  description:
    'Fetches a specific workspace memory entry by ID for precise recall after searching.',
  inputSchema: GetWorkspaceMemoryParamsSchema
}

export interface GetWorkspaceMemoryResult {
  status: 'success' | 'error' | 'not_found'
  message: string
  memory?: {
    id: string
    summary: string
    scope: 'chat' | 'global'
    memoryType: 'session_outcome' | 'tool_outcome'
    createdAt: string
    source: string
    details?: unknown
  }
}
