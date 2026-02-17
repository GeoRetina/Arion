import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  layerDbService: {
    getAllLayers: vi.fn<() => Array<{ id: string; sourceId: string }>>(() => [])
  },
  runtimeLayers: [] as Array<Record<string, unknown>>
}))

vi.mock('../../../llm-tools/map-layer-management-tools', () => ({
  listMapLayersToolName: 'list_map_layers',
  listMapLayersToolDefinition: { description: 'List map layers', inputSchema: {} },
  setLayerStyleToolName: 'set_layer_style',
  setLayerStyleToolDefinition: { description: 'Set layer style', inputSchema: {} },
  removeMapLayerToolName: 'remove_map_layer',
  removeMapLayerToolDefinition: { description: 'Remove map layer', inputSchema: {} }
}))

vi.mock('../../layer-database-service', () => ({
  getLayerDbService: () => mocks.layerDbService
}))

vi.mock('../../../ipc/layer-handlers', () => ({
  getRuntimeLayerSnapshot: () => mocks.runtimeLayers
}))

import { registerMapLayerManagementTools } from './map-layer-management-tool-pack'

function createRegistry(): {
  registry: never
  entries: Map<
    string,
    { execute: (params?: { args: Record<string, unknown> }) => Promise<unknown> }
  >
} {
  const entries = new Map<
    string,
    { execute: (params?: { args: Record<string, unknown> }) => Promise<unknown> }
  >()
  return {
    registry: {
      register: (tool: {
        name: string
        execute: (params?: { args: Record<string, unknown> }) => Promise<unknown>
      }) => {
        entries.set(tool.name, { execute: tool.execute })
      }
    } as never,
    entries
  }
}

describe('registerMapLayerManagementTools', () => {
  it('lists session layers by excluding persisted runtime layers', async () => {
    mocks.layerDbService.getAllLayers.mockReturnValue([
      { id: 'persisted-id', sourceId: 'persisted-source' }
    ])
    mocks.runtimeLayers = [
      {
        id: 'persisted-id',
        sourceId: 'persisted-source',
        name: 'Persisted',
        sourceConfig: { type: 'geojson' }
      },
      {
        id: 'session-id',
        sourceId: 'session-source',
        name: 'Session Layer',
        sourceConfig: { type: 'geojson' },
        type: 'vector',
        metadata: { tags: ['a'], geometryType: 'Point' },
        visibility: true,
        opacity: 1,
        zIndex: 1
      }
    ]

    const { registry, entries } = createRegistry()
    registerMapLayerManagementTools(registry, { mapLayerTracker: {} as never })

    const result = (await entries.get('list_map_layers')?.execute()) as {
      status: string
      layers: Array<{ id: string; sourceId: string }>
      message: string
    }

    expect(result.status).toBe('success')
    expect(result.layers).toEqual([
      expect.objectContaining({
        id: 'session-id',
        sourceId: 'session-source'
      })
    ])
    expect(result.message).toContain('Found 1 session')
  })

  it('handles set_layer_style validation and success cases', async () => {
    const send = vi.fn()
    const mapLayerTracker = {
      hasLayer: vi.fn((id: string) => id === 'exists'),
      getMainWindow: vi.fn(() => ({ webContents: { send } }))
    }

    const { registry, entries } = createRegistry()
    registerMapLayerManagementTools(registry, { mapLayerTracker: mapLayerTracker as never })

    const styleTool = entries.get('set_layer_style')
    const notFound = (await styleTool?.execute({
      args: { source_id: 'missing', paint: { 'fill-color': '#fff' } }
    })) as { status: string }
    expect(notFound.status).toBe('error')

    const noPaint = (await styleTool?.execute({
      args: { source_id: 'exists' }
    })) as { status: string; message: string }
    expect(noPaint.status).toBe('success')
    expect(noPaint.message).toContain('No paint properties provided')

    const applied = (await styleTool?.execute({
      args: { source_id: 'exists', paint: { 'fill-color': '#fff' } }
    })) as { status: string; applied_properties: Record<string, string> }
    expect(applied.status).toBe('success')
    expect(applied.applied_properties).toEqual({ 'fill-color': '#fff' })
    expect(send).toHaveBeenCalledWith('ctg:map:setPaintProperties', {
      sourceId: 'exists',
      paintProperties: { 'fill-color': '#fff' }
    })
  })

  it('removes tracked layers and sends remove command', async () => {
    const send = vi.fn()
    const removeLayer = vi.fn()
    const mapLayerTracker = {
      hasLayer: vi.fn(() => true),
      getMainWindow: vi.fn(() => ({ webContents: { send } })),
      removeLayer
    }

    const { registry, entries } = createRegistry()
    registerMapLayerManagementTools(registry, { mapLayerTracker: mapLayerTracker as never })

    const removeTool = entries.get('remove_map_layer')
    const result = (await removeTool?.execute({
      args: { source_id: 'session-source' }
    })) as { status: string; removed_source_id: string }

    expect(removeLayer).toHaveBeenCalledWith('session-source')
    expect(send).toHaveBeenCalledWith('ctg:map:removeSourceAndLayers', {
      sourceId: 'session-source'
    })
    expect(result).toEqual({
      status: 'success',
      message:
        'Request to remove layer with source ID "session-source" sent. It should now be removed from the map and layer list.',
      removed_source_id: 'session-source'
    })
  })
})
