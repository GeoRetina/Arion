import { describe, expect, it, vi } from 'vitest'
import { setMapViewToolName } from '../../../llm-tools/map-view-control-tools'
import { registerMapViewTools } from './map-view-tool-pack'

function createRegistry(): {
  registry: never
  entries: Map<string, { execute: (params: { args: unknown }) => Promise<unknown> }>
} {
  const entries = new Map<string, { execute: (params: { args: unknown }) => Promise<unknown> }>()
  return {
    registry: {
      register: (tool: {
        name: string
        execute: (params: { args: unknown }) => Promise<unknown>
      }) => {
        entries.set(tool.name, { execute: tool.execute })
      }
    } as never,
    entries
  }
}

describe('registerMapViewTools', () => {
  it('sends set view payload with provided parameters', async () => {
    const send = vi.fn()
    const { registry, entries } = createRegistry()

    registerMapViewTools(registry, {
      getMainWindow: () =>
        ({
          webContents: { send }
        }) as never
    })

    const tool = entries.get(setMapViewToolName)
    const result = (await tool?.execute({
      args: { center: [10, 20], zoom: 8, animate: false }
    })) as { status: string; applied_params: Record<string, unknown> }

    expect(send).toHaveBeenCalledWith('ctg:map:setView', {
      center: [10, 20],
      zoom: 8,
      animate: false
    })
    expect(result.status).toBe('success')
    expect(result.applied_params).toEqual({
      center: [10, 20],
      zoom: 8,
      animate: false
    })
  })

  it('returns error when main window is unavailable', async () => {
    const { registry, entries } = createRegistry()
    registerMapViewTools(registry, { getMainWindow: () => null })

    const tool = entries.get(setMapViewToolName)
    const result = (await tool?.execute({
      args: { zoom: 5 }
    })) as { status: string; message: string }

    expect(result.status).toBe('error')
    expect(result.message).toContain('Main window not available')
  })
})
