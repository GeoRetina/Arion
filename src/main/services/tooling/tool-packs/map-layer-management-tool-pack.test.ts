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
  it('lists all runtime layers and annotates persistence state', async () => {
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
      layers: Array<{ id: string; sourceId: string; persistedInDatabase: boolean }>
      message: string
    }

    expect(result.status).toBe('success')
    expect(result.layers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'persisted-id',
          sourceId: 'persisted-source',
          persistedInDatabase: true
        }),
        expect.objectContaining({
          id: 'session-id',
          sourceId: 'session-source',
          persistedInDatabase: false
        })
      ])
    )
    expect(result.message).toContain('Found 2 available')
  })

  it('includes localFilePath when a runtime layer came from a local file', async () => {
    mocks.layerDbService.getAllLayers.mockReturnValue([])
    mocks.runtimeLayers = [
      {
        id: 'vector-id',
        sourceId: 'vector-source',
        name: 'Roads',
        sourceConfig: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
        type: 'vector',
        createdBy: 'import',
        metadata: {
          tags: ['imported', 'source:file-import'],
          geometryType: 'LineString',
          context: {
            localFilePath: 'C:\\data\\roads.geojson'
          }
        }
      },
      {
        id: 'raster-id',
        sourceId: 'raster-source',
        name: 'Elevation',
        sourceConfig: {
          type: 'raster',
          data: 'arion-raster://asset/{z}/{x}/{y}.png',
          options: {
            rasterSourcePath: 'C:\\data\\elevation.tif'
          }
        },
        type: 'raster',
        createdBy: 'import',
        metadata: {
          tags: ['imported', 'geotiff']
        }
      },
      {
        id: 'image-id',
        sourceId: 'image-source',
        name: 'Overlay',
        sourceConfig: {
          type: 'image',
          data: 'C:\\data\\overlay.png'
        },
        type: 'raster',
        createdBy: 'tool',
        metadata: {
          tags: ['image']
        }
      }
    ]

    const { registry, entries } = createRegistry()
    registerMapLayerManagementTools(registry, { mapLayerTracker: {} as never })

    const result = (await entries.get('list_map_layers')?.execute()) as {
      status: string
      layers: Array<{ id: string; localFilePath?: string }>
    }

    expect(result.status).toBe('success')
    expect(result.layers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'vector-id',
          localFilePath: 'C:\\data\\roads.geojson'
        }),
        expect.objectContaining({
          id: 'raster-id',
          localFilePath: 'C:\\data\\elevation.tif'
        }),
        expect.objectContaining({
          id: 'image-id',
          localFilePath: 'C:\\data\\overlay.png'
        })
      ])
    )
  })

  it('styles runtime layers even when they were not tracker-recorded', async () => {
    const send = vi.fn()
    const mapLayerTracker = {
      hasLayer: vi.fn(() => false),
      getMainWindow: vi.fn(() => ({ webContents: { send } }))
    }
    mocks.runtimeLayers = [
      {
        id: 'imported-id',
        sourceId: 'imported-source',
        name: 'Imported layer',
        sourceConfig: { type: 'geojson' },
        type: 'vector'
      }
    ]

    const { registry, entries } = createRegistry()
    registerMapLayerManagementTools(registry, { mapLayerTracker: mapLayerTracker as never })

    const styleTool = entries.get('set_layer_style')
    const notFound = (await styleTool?.execute({
      args: { source_id: 'missing', paint: { 'fill-color': '#fff' } }
    })) as { status: string }
    expect(notFound.status).toBe('error')

    const noPaint = (await styleTool?.execute({
      args: { source_id: 'imported-source' }
    })) as { status: string; message: string }
    expect(noPaint.status).toBe('success')
    expect(noPaint.message).toContain('No paint properties provided')

    const applied = (await styleTool?.execute({
      args: { source_id: 'imported-source', paint: { 'fill-color': '#fff' } }
    })) as { status: string; applied_properties: Record<string, string> }
    expect(applied.status).toBe('success')
    expect(applied.applied_properties).toEqual({ 'fill-color': '#fff' })
    expect(send).toHaveBeenCalledWith('ctg:map:setPaintProperties', {
      sourceId: 'imported-source',
      paintProperties: { 'fill-color': '#fff' }
    })
  })

  it('removes runtime layers and sends remove command', async () => {
    const send = vi.fn()
    const removeLayer = vi.fn()
    const mapLayerTracker = {
      hasLayer: vi.fn(() => false),
      getMainWindow: vi.fn(() => ({ webContents: { send } })),
      removeLayer
    }
    mocks.runtimeLayers = [
      {
        id: 'session-id',
        sourceId: 'session-source',
        name: 'Session Layer',
        sourceConfig: { type: 'geojson' },
        type: 'vector'
      }
    ]

    const { registry, entries } = createRegistry()
    registerMapLayerManagementTools(registry, { mapLayerTracker: mapLayerTracker as never })

    const removeTool = entries.get('remove_map_layer')
    const result = (await removeTool?.execute({
      args: { source_id: 'session-source' }
    })) as { status: string; removed_source_id: string }

    expect(removeLayer).not.toHaveBeenCalled()
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
