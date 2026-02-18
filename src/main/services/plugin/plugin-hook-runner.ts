import type { PluginDiagnosticEntry, PluginHookInfo } from '../../../shared/ipc-types'
import { createDiagnostic } from './plugin-diagnostic-utils'
import {
  PLUGIN_HOOK_EVENTS,
  type PluginHookEvent,
  type PluginHookRecord,
  type PluginHookRegistration
} from './plugin-types'

const DEFAULT_HOOK_PRIORITY = 100
const HOOK_EVENT_SET = new Set<string>(PLUGIN_HOOK_EVENTS)

const compareHooks = (a: PluginHookRecord, b: PluginHookRecord): number => {
  if (a.priority !== b.priority) {
    return b.priority - a.priority
  }
  return a.pluginId.localeCompare(b.pluginId)
}

export class PluginHookRunner {
  private readonly hooksByEvent = new Map<PluginHookEvent, PluginHookRecord[]>()

  public clear(): void {
    this.hooksByEvent.clear()
  }

  public register(pluginId: string, hook: PluginHookRegistration): void {
    if (!HOOK_EVENT_SET.has(hook.event)) {
      return
    }

    const normalizedHook: PluginHookRecord = {
      ...hook,
      pluginId,
      priority:
        typeof hook.priority === 'number' && Number.isFinite(hook.priority)
          ? hook.priority
          : DEFAULT_HOOK_PRIORITY
    }

    const existing = this.hooksByEvent.get(normalizedHook.event) || []
    existing.push(normalizedHook)
    existing.sort(compareHooks)
    this.hooksByEvent.set(normalizedHook.event, existing)
  }

  public listHooks(): PluginHookInfo[] {
    const hooks: PluginHookInfo[] = []
    for (const [event, eventHooks] of this.hooksByEvent.entries()) {
      for (const hook of eventHooks) {
        hooks.push({
          pluginId: hook.pluginId,
          event,
          mode: hook.mode,
          priority: hook.priority
        })
      }
    }
    return hooks.sort((a, b) => {
      if (a.event !== b.event) {
        return a.event.localeCompare(b.event)
      }
      if (a.priority !== b.priority) {
        return b.priority - a.priority
      }
      return a.pluginId.localeCompare(b.pluginId)
    })
  }

  public async emit<T>(
    event: PluginHookEvent,
    payload: T,
    context: Record<string, unknown> = {}
  ): Promise<{ payload: T; diagnostics: PluginDiagnosticEntry[] }> {
    const diagnostics: PluginDiagnosticEntry[] = []
    const eventHooks = this.hooksByEvent.get(event) || []
    if (eventHooks.length === 0) {
      return { payload, diagnostics }
    }

    let currentPayload = payload
    const modifyingHooks = eventHooks.filter((hook) => hook.mode === 'modify')
    const observerHooks = eventHooks.filter((hook) => hook.mode === 'observe')

    for (const hook of modifyingHooks) {
      try {
        const result = await hook.handler(currentPayload, context)
        if (result !== undefined) {
          currentPayload = result as T
        }
      } catch (error) {
        diagnostics.push(
          createDiagnostic(
            'error',
            'plugin_hook_modify_error',
            `Modifying hook failed for event "${event}": ${error instanceof Error ? error.message : String(error)}`,
            { pluginId: hook.pluginId }
          )
        )
      }
    }

    if (observerHooks.length > 0) {
      const observerResults = await Promise.allSettled(
        observerHooks.map((hook) =>
          Promise.resolve().then(() => hook.handler(currentPayload, context))
        )
      )
      observerResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          return
        }

        diagnostics.push(
          createDiagnostic(
            'error',
            'plugin_hook_observer_error',
            `Observer hook failed for event "${event}": ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`,
            { pluginId: observerHooks[index]?.pluginId }
          )
        )
      })
    }

    return {
      payload: currentPayload,
      diagnostics
    }
  }
}
