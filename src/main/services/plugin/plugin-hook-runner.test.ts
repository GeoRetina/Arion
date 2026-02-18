import { describe, expect, it } from 'vitest'
import { PluginHookRunner } from './plugin-hook-runner'

describe('PluginHookRunner', () => {
  it('runs modifying hooks in descending priority order and returns transformed payload', async () => {
    const runner = new PluginHookRunner()

    runner.register('plugin-a', {
      event: 'before_tool_call',
      mode: 'modify',
      priority: 10,
      handler: (payload) => {
        const current = payload as { args: { trace: string[] } }
        return {
          ...current,
          args: {
            trace: [...current.args.trace, 'a']
          }
        }
      }
    })
    runner.register('plugin-b', {
      event: 'before_tool_call',
      mode: 'modify',
      priority: 100,
      handler: (payload) => {
        const current = payload as { args: { trace: string[] } }
        return {
          ...current,
          args: {
            trace: [...current.args.trace, 'b']
          }
        }
      }
    })

    const result = await runner.emit(
      'before_tool_call',
      {
        toolName: 'demo',
        args: {
          trace: []
        }
      },
      {}
    )

    const payload = result.payload as { args: { trace: string[] } }
    expect(payload.args.trace).toEqual(['b', 'a'])
    expect(result.diagnostics).toEqual([])
  })

  it('isolates observer hook errors and reports diagnostics', async () => {
    const runner = new PluginHookRunner()
    runner.register('plugin-observer', {
      event: 'after_tool_call',
      mode: 'observe',
      handler: () => {
        throw new Error('observer failed')
      }
    })

    const result = await runner.emit(
      'after_tool_call',
      {
        toolName: 'demo',
        result: { ok: true }
      },
      {}
    )

    expect(result.payload).toEqual({
      toolName: 'demo',
      result: { ok: true }
    })
    expect(result.diagnostics).toHaveLength(1)
    expect(result.diagnostics[0]?.code).toBe('plugin_hook_observer_error')
  })
})
