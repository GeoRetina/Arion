import type { UIDataTypes, UIMessage, UITools } from 'ai'
import type { Message as DbMessage, Subtask } from '../../../../../shared/ipc-types'

export interface StoredMessageOrchestration {
  subtasks?: Subtask[]
  agentsInvolved?: string[]
  completionTime?: number
}

export type HydratedStoredMessage = UIMessage<unknown, UIDataTypes, UITools> & {
  content?: string
  createdAt?: Date
  hydrated?: boolean
  orchestration?: StoredMessageOrchestration
}

interface StoredMessagePartsEnvelope {
  version: 1
  parts: unknown[]
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function normalizeStoredRole(role: DbMessage['role']): UIMessage['role'] {
  if (role === 'data' || role === 'function' || role === 'tool') {
    return 'assistant'
  }

  return role
}

function fallbackParts(content: string): HydratedStoredMessage['parts'] {
  return content.length > 0 ? [{ type: 'text', text: content }] : []
}

function parseStoredParts(
  serializedParts: string | null | undefined,
  content: string
): HydratedStoredMessage['parts'] {
  if (!serializedParts) {
    return fallbackParts(content)
  }

  try {
    const parsed = JSON.parse(serializedParts) as unknown

    if (Array.isArray(parsed)) {
      return parsed as HydratedStoredMessage['parts']
    }

    const envelope = asRecord(parsed) as StoredMessagePartsEnvelope | null
    if (envelope && Array.isArray(envelope.parts)) {
      return envelope.parts as HydratedStoredMessage['parts']
    }
  } catch {
    return fallbackParts(content)
  }

  return fallbackParts(content)
}

function parseStoredOrchestration(
  serializedOrchestration: string | null | undefined
): StoredMessageOrchestration | undefined {
  if (!serializedOrchestration) {
    return undefined
  }

  try {
    const parsed = JSON.parse(serializedOrchestration) as unknown
    const record = asRecord(parsed)
    if (!record) {
      return undefined
    }

    const orchestration: StoredMessageOrchestration = {}

    if (Array.isArray(record.subtasks)) {
      orchestration.subtasks = record.subtasks as Subtask[]
    }

    if (Array.isArray(record.agentsInvolved)) {
      orchestration.agentsInvolved = record.agentsInvolved.filter(
        (agentId): agentId is string => typeof agentId === 'string'
      )
    }

    if (typeof record.completionTime === 'number') {
      orchestration.completionTime = record.completionTime
    }

    if (
      orchestration.subtasks ||
      orchestration.agentsInvolved ||
      orchestration.completionTime !== undefined
    ) {
      return orchestration
    }
  } catch {
    return undefined
  }

  return undefined
}

export function serializeMessageParts(parts: unknown[] | undefined): string | undefined {
  if (!Array.isArray(parts) || parts.length === 0) {
    return undefined
  }

  try {
    return JSON.stringify({
      version: 1,
      parts
    } satisfies StoredMessagePartsEnvelope)
  } catch {
    return undefined
  }
}

export function hydrateStoredMessage(
  storeMessage: DbMessage,
  options?: { hydrated?: boolean }
): HydratedStoredMessage {
  const content = storeMessage.content ?? ''
  const hydratedMessage: HydratedStoredMessage = {
    id: storeMessage.id,
    role: normalizeStoredRole(storeMessage.role),
    createdAt: storeMessage.created_at ? new Date(storeMessage.created_at) : undefined,
    parts: parseStoredParts(storeMessage.tool_calls, content)
  }

  if (content.length > 0) {
    hydratedMessage.content = content
  }

  if (options?.hydrated) {
    hydratedMessage.hydrated = true
  }

  const orchestration = parseStoredOrchestration(storeMessage.orchestration)
  if (orchestration) {
    hydratedMessage.orchestration = orchestration
  }

  return hydratedMessage
}
