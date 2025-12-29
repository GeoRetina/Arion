import type { LanguageModelV3FinishReason } from '@ai-sdk/provider'
import { generateId, type ParseResult } from '@ai-sdk/provider-utils'
import { z } from 'zod'
import { baseOllamaResponseSchema, type OllamaResponse } from './types'

export function mapOllamaFinishReason(
  finishReason: string | null | undefined
): LanguageModelV3FinishReason {
  const raw = finishReason ?? undefined
  switch (finishReason) {
    case 'stop':
      return { unified: 'stop', raw }
    case 'length':
      return { unified: 'length', raw }
    case 'content_filter':
      return { unified: 'content-filter', raw }
    case 'function_call':
    case 'tool_calls':
      return { unified: 'tool-calls', raw }
    default:
      return { unified: 'other', raw }
  }
}

export function extractOllamaResponseObjectsFromChunk(
  chunk: ParseResult<z.infer<typeof baseOllamaResponseSchema>>
): OllamaResponse[] {
  if (chunk.success) {
    return [chunk.value]
  }

  const results: OllamaResponse[] = []
  const raw = (chunk.error as any)?.text
  if (typeof raw !== 'string' || raw.length === 0) {
    return results
  }

  const lines = raw.split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const parsed = JSON.parse(trimmed)
      const validated = baseOllamaResponseSchema.safeParse(parsed)
      if (validated.success) {
        results.push(validated.data)
      }
    } catch {
      continue
    }
  }

  return results
}

export function getResponseMetadata(value: { created_at?: string | null; model?: string | null }) {
  return {
    id: undefined,
    modelId: value.model ?? undefined,
    timestamp: value.created_at ? new Date(value.created_at) : undefined
  }
}

export function normalizeToolArguments(input: unknown) {
  if (typeof input === 'string') {
    try {
      return JSON.parse(input)
    } catch {
      return { input }
    }
  }
  return input ?? {}
}

export function serializeToolArguments(input: unknown) {
  if (typeof input === 'string') {
    return input
  }
  try {
    return JSON.stringify(input ?? {})
  } catch {
    return JSON.stringify({ value: String(input) })
  }
}

export function createToolCallId(generator?: () => string) {
  return generator?.() ?? generateId()
}
