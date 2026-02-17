import type { z } from 'zod'

export interface ToolExecutorParams {
  args: UnsafeAny
  sourceIdPrefix?: string
  chatId?: string
}
export type ToolExecutor = (params: ToolExecutorParams) => Promise<UnsafeAny>

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
