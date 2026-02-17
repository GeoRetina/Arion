import { describe, expect, it, vi } from 'vitest'
import { openMapSidebarToolName } from '../../../llm-tools/app-ui-control-tools'
import { registerAppUiTools } from './app-ui-tool-pack'

function createRegistry(): {
  registry: never
  entries: Map<string, { execute: (params: unknown) => Promise<unknown> }>
} {
  const entries = new Map<string, { execute: (params: unknown) => Promise<unknown> }>()
  return {
    registry: {
      register: (tool: { name: string; execute: (params: unknown) => Promise<unknown> }) => {
        entries.set(tool.name, { execute: tool.execute })
      }
    } as never,
    entries
  }
}

describe('registerAppUiTools', () => {
  it('registers map sidebar tool and sends UI command when window exists', async () => {
    const send = vi.fn()
    const { registry, entries } = createRegistry()

    registerAppUiTools(registry, {
      getMainWindow: () =>
        ({
          webContents: { send }
        }) as never
    })

    const tool = entries.get(openMapSidebarToolName)
    expect(tool).toBeDefined()

    const result = (await tool?.execute({})) as { status: string }
    expect(send).toHaveBeenCalledWith('ctg:ui:setMapSidebarVisibility', { visible: true })
    expect(result.status).toBe('success')
  })

  it('returns error result when main window is unavailable', async () => {
    const { registry, entries } = createRegistry()

    registerAppUiTools(registry, {
      getMainWindow: () => null
    })

    const tool = entries.get(openMapSidebarToolName)
    const result = (await tool?.execute({})) as { status: string; message: string }

    expect(result.status).toBe('error')
    expect(result.message).toContain('Main window not available')
  })
})
