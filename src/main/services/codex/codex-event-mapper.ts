import { randomUUID } from 'crypto'
import type { CodexApprovalRequest, CodexRuntimeEvent } from '../../../shared/ipc-types'

interface JsonRpcRequest {
  id: string | number
  method: string
  params?: unknown
}

interface JsonRpcNotification {
  method: string
  params?: unknown
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function extractItem(params: unknown): Record<string, unknown> | null {
  return asRecord(asRecord(params)?.item)
}

function extractTurn(params: unknown): Record<string, unknown> | null {
  return asRecord(asRecord(params)?.turn)
}

export function mapCodexNotificationToRuntimeEvent(input: {
  runId: string
  chatId: string
  notification: JsonRpcNotification
  createdAt?: string
}): CodexRuntimeEvent | null {
  const createdAt = input.createdAt ?? new Date().toISOString()
  const params = input.notification.params
  const paramsRecord = asRecord(params)

  if (input.notification.method === 'thread/status/changed') {
    const statusRecord = asRecord(paramsRecord?.status)
    const statusType = asString(statusRecord?.type)
    const activeFlags = Array.isArray(statusRecord?.activeFlags)
      ? statusRecord.activeFlags.filter((value): value is string => typeof value === 'string')
      : []

    return {
      eventId: randomUUID(),
      runId: input.runId,
      chatId: input.chatId,
      type: 'status',
      createdAt,
      status:
        statusType === 'systemError'
          ? 'failed'
          : statusType === 'active' && activeFlags.includes('waitingOnApproval')
            ? 'awaiting-approval'
            : statusType === 'active'
              ? 'running'
              : undefined,
      message:
        statusType === 'active' && activeFlags.length > 0
          ? `${statusType}:${activeFlags.join(',')}`
          : statusType || 'Thread status changed'
    }
  }

  if (input.notification.method === 'item/agentMessage/delta') {
    return {
      eventId: randomUUID(),
      runId: input.runId,
      chatId: input.chatId,
      type: 'message-delta',
      createdAt,
      text: asString(paramsRecord?.delta) || '',
      itemId: asString(paramsRecord?.itemId),
      turnId: asString(paramsRecord?.turnId)
    }
  }

  if (input.notification.method === 'item/started') {
    const item = extractItem(params)
    if (item?.type === 'commandExecution') {
      return {
        eventId: randomUUID(),
        runId: input.runId,
        chatId: input.chatId,
        type: 'command-started',
        createdAt,
        itemId: asString(item.id),
        turnId: asString(paramsRecord?.turnId),
        command: asString(item.command),
        cwd: asString(item.cwd) ?? null
      }
    }

    return null
  }

  if (input.notification.method === 'item/completed') {
    const item = extractItem(params)
    if (!item) {
      return null
    }

    if (item.type === 'agentMessage') {
      return {
        eventId: randomUUID(),
        runId: input.runId,
        chatId: input.chatId,
        type: 'message',
        createdAt,
        itemId: asString(item.id),
        turnId: asString(paramsRecord?.turnId),
        phase:
          item.phase === 'commentary' || item.phase === 'final_answer' ? item.phase : 'unknown',
        text: asString(item.text)
      }
    }

    if (item.type === 'commandExecution') {
      return {
        eventId: randomUUID(),
        runId: input.runId,
        chatId: input.chatId,
        type: 'command-completed',
        createdAt,
        itemId: asString(item.id),
        turnId: asString(paramsRecord?.turnId),
        command: asString(item.command),
        cwd: asString(item.cwd) ?? null,
        message: asString(item.aggregatedOutput),
        exitCode: asNumber(item.exitCode) ?? null
      }
    }

    return null
  }

  if (input.notification.method === 'turn/completed') {
    const turn = extractTurn(params)
    const status = asString(turn?.status)
    return {
      eventId: randomUUID(),
      runId: input.runId,
      chatId: input.chatId,
      type: 'turn-completed',
      createdAt,
      turnId: asString(turn?.id),
      status:
        status === 'completed'
          ? 'completed'
          : status === 'failed'
            ? 'failed'
            : status === 'interrupted' || status === 'cancelled'
              ? 'cancelled'
              : 'running',
      message: asString(asRecord(turn?.error)?.message)
    }
  }

  if (input.notification.method === 'error') {
    return {
      eventId: randomUUID(),
      runId: input.runId,
      chatId: input.chatId,
      type: 'error',
      createdAt,
      message: asString(asRecord(paramsRecord?.error)?.message) || 'Codex reported an error.'
    }
  }

  return null
}

export function mapCodexRequestToApproval(input: {
  runId: string
  chatId: string
  approvalId: string
  request: JsonRpcRequest
  createdAt?: string
}): CodexApprovalRequest | null {
  const createdAt = input.createdAt ?? new Date().toISOString()
  const params = asRecord(input.request.params)

  if (!params) {
    return null
  }

  const kind =
    input.request.method === 'item/commandExecution/requestApproval'
      ? 'command'
      : input.request.method === 'item/fileChange/requestApproval'
        ? 'file-change'
        : input.request.method === 'item/fileRead/requestApproval'
          ? 'file-read'
          : input.request.method === 'item/tool/requestUserInput'
            ? 'tool-user-input'
            : 'unknown'

  return {
    approvalId: input.approvalId,
    runId: input.runId,
    chatId: input.chatId,
    kind,
    createdAt,
    requestId: String(input.request.id),
    turnId: asString(params.turnId),
    itemId: asString(params.itemId),
    command: asString(params.command) ?? null,
    cwd: asString(params.cwd) ?? null,
    reason: asString(params.reason) ?? null,
    grantRoot: asString(params.grantRoot) ?? null,
    commandActions: Array.isArray(params.commandActions)
      ? params.commandActions
          .map((entry) => {
            const action = asRecord(entry)
            if (!action) {
              return null
            }

            return {
              type: asString(action.type) || 'unknown',
              command: asString(action.command) || '',
              path: asString(action.path) ?? null,
              name: asString(action.name) ?? null,
              query: asString(action.query) ?? null
            }
          })
          .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
      : undefined
  }
}
