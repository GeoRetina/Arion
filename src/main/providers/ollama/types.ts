import type {
  LanguageModelV3FinishReason,
  LanguageModelV3Usage
} from '@ai-sdk/provider'
import {
  createJsonErrorResponseHandler,
  type FetchFunction
} from '@ai-sdk/provider-utils'
import { z } from 'zod'

export type CreateOllamaOptions = {
  baseURL?: string
  headers?: Record<string, string>
  fetch?: FetchFunction
  name?: string
}

export type OllamaConfig = {
  provider: string
  url: (options: { modelId: string; path: string }) => string
  headers: () => Record<string, string | undefined>
  fetch?: FetchFunction
  generateId?: () => string
}

export const ollamaProviderOptionsSchema = z.object({
  think: z.union([z.boolean(), z.enum(['high', 'medium', 'low'])]).optional(),
  keep_alive: z.union([z.string(), z.number()]).optional(),
  options: z.record(z.any()).optional()
})

export type RequestBuilderArgs = {
  model: string
  messages: any
  temperature?: number
  top_p?: number
  max_output_tokens?: number
  format?: object | string
  think?: boolean | 'high' | 'medium' | 'low'
  options?: Record<string, unknown>
  keep_alive?: string | number
  tools?: Array<any>
  tool_choice?:
    | 'auto'
    | 'none'
    | 'required'
    | { type: 'web_search_preview' }
    | { type: 'function'; name: string }
}

const functionArgumentsSchema = z.union([z.record(z.string(), z.any()), z.string()])

export const ollamaErrorDataSchema = z.object({
  error: z.object({
    message: z.string(),
    type: z.string().optional().nullable(),
    param: z.any().optional().nullable(),
    code: z.union([z.string(), z.number()]).optional().nullable()
  })
})

export const ollamaFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: ollamaErrorDataSchema,
  errorToMessage: (data) => data.error.message
})

export const baseOllamaResponseSchema = z.object({
  model: z.string().optional(),
  created_at: z.string().optional(),
  done: z.boolean(),
  message: z.object({
    content: z.string().optional(),
    role: z.string().optional(),
    thinking: z.string().optional(),
    tool_calls: z
      .array(
        z.object({
          function: z.object({
            name: z.string(),
            arguments: functionArgumentsSchema.optional()
          }),
          id: z.string().optional()
        })
      )
      .optional()
      .nullable()
  }),
  done_reason: z.string().optional(),
  eval_count: z.number().optional(),
  eval_duration: z.number().optional(),
  load_duration: z.number().optional(),
  prompt_eval_count: z.number().optional(),
  prompt_eval_duration: z.number().optional(),
  total_duration: z.number().optional()
})

export type OllamaResponse = z.infer<typeof baseOllamaResponseSchema>

export type OllamaUsage = LanguageModelV3Usage
export type OllamaFinishReason = LanguageModelV3FinishReason
