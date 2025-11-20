import type { z } from 'zod'

export interface ToolExecutorParams {
  args: any
  sourceIdPrefix?: string
  chatId?: string
}
export type ToolExecutor = (params: ToolExecutorParams) => Promise<any>

export interface RegisteredToolDefinition {
  description: string
  inputSchema: z.ZodTypeAny
}

export interface RegisteredTool {
  name: string
  definition: RegisteredToolDefinition
  execute: ToolExecutor
  category: string
  isDynamic?: boolean
}
