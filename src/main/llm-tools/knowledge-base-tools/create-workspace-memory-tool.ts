import { z } from 'zod'

export const createWorkspaceMemoryToolName = 'create_workspace_memory'

const workspaceMemoryScopeSchema = z.enum(['chat', 'global'])
const workspaceMemoryTypeSchema = z.enum(['session_outcome', 'tool_outcome'])

export const CreateWorkspaceMemoryParamsSchema = z.object({
  summary: z
    .string()
    .describe(
      'Concise durable memory statement to store for future recall (decision, preference, outcome, or todo).'
    ),
  scope: workspaceMemoryScopeSchema
    .optional()
    .describe(
      'Memory scope. Use "global" for cross-chat recall, "chat" for current-chat-only context.'
    ),
  memoryType: workspaceMemoryTypeSchema
    .optional()
    .describe('Memory type label. Defaults to "session_outcome".'),
  details: z
    .string()
    .optional()
    .describe('Optional supplemental detail text that helps future retrieval and interpretation.')
})
export type CreateWorkspaceMemoryParams = z.infer<typeof CreateWorkspaceMemoryParamsSchema>

export const createWorkspaceMemoryToolDefinition = {
  description:
    'Stores a durable workspace memory explicitly for future retrieval. Use this when the user asks to remember something or when a high-value decision/outcome should persist.',
  inputSchema: CreateWorkspaceMemoryParamsSchema
}

export interface CreateWorkspaceMemoryResult {
  status: 'success' | 'error'
  message: string
  memory?: {
    id: string
    summary: string
    scope: 'chat' | 'global'
    memoryType: 'session_outcome' | 'tool_outcome'
    createdAt: string
    source: string
  }
}
