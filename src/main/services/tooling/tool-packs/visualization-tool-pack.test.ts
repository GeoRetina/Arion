import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createGeoJSONFeature: vi.fn(),
  createGeoJSONBuffer: vi.fn(),
  convertImageFileToDataUri: vi.fn()
}))

vi.mock('../../../llm-tools/visualization-tools/add-vector-feature-tool', () => ({
  addMapFeatureToolName: 'add_map_feature',
  addMapFeatureToolDefinition: { description: 'Add map feature', inputSchema: {} },
  createGeoJSONFeature: (...params: unknown[]) => mocks.createGeoJSONFeature(...params)
}))

vi.mock('../../../llm-tools/visualization-tools/add-georeference-image-layer-tool', () => ({
  addGeoreferencedImageLayerToolName: 'add_georeferenced_image_layer',
  addGeoreferencedImageLayerToolDefinition: {
    description: 'Add georeferenced image',
    inputSchema: {}
  }
}))

vi.mock('../../../llm-tools/visualization-tools/display-chart-tool', () => ({
  displayChartToolName: 'display_chart',
  displayChartToolDefinition: { description: 'Display chart', inputSchema: {} }
}))

vi.mock('../../../llm-tools/basic-geospatial-tools', () => ({
  createMapBufferToolName: 'create_map_buffer',
  createMapBufferToolDefinition: { description: 'Create map buffer', inputSchema: {} },
  createGeoJSONBuffer: (...params: unknown[]) => mocks.createGeoJSONBuffer(...params)
}))

vi.mock('../../../lib/image-processing', () => ({
  convertImageFileToDataUri: (...params: unknown[]) => mocks.convertImageFileToDataUri(...params)
}))

import { registerVisualizationTools } from './visualization-tool-pack'

function createRegistry(): {
  registry: never
  entries: Map<
    string,
    { execute: (params: { args: unknown; sourceIdPrefix?: string }) => Promise<unknown> }
  >
} {
  const entries = new Map<
    string,
    { execute: (params: { args: unknown; sourceIdPrefix?: string }) => Promise<unknown> }
  >()
  return {
    registry: {
      register: (tool: {
        name: string
        execute: (params: { args: unknown; sourceIdPrefix?: string }) => Promise<unknown>
      }) => {
        entries.set(tool.name, { execute: tool.execute })
      }
    } as never,
    entries
  }
}

describe('registerVisualizationTools', () => {
  it('adds feature layers and tracks them', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1700)
    mocks.createGeoJSONFeature.mockReturnValue({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [1, 2] },
      properties: {}
    })

    const sendFeatureToMap = vi.fn()
    const recordLayer = vi.fn()
    const { registry, entries } = createRegistry()

    registerVisualizationTools(registry, {
      mapLayerTracker: { sendFeatureToMap, recordLayer } as never
    })

    const tool = entries.get('add_map_feature')
    const result = (await tool?.execute({
      args: { latitude: 1, longitude: 2 },
      sourceIdPrefix: 'test'
    })) as { status: string; sourceId: string }

    expect(sendFeatureToMap).toHaveBeenCalled()
    expect(recordLayer).toHaveBeenCalled()
    expect(result.status).toBe('success')
    expect(result.sourceId).toBe('test-add_map_feature-1700')
  })

  it('returns error when image layer is requested without main window', async () => {
    const { registry, entries } = createRegistry()
    registerVisualizationTools(registry, {
      mapLayerTracker: {
        getMainWindow: () => null,
        recordLayer: vi.fn()
      } as never
    })

    const tool = entries.get('add_georeferenced_image_layer')
    const result = (await tool?.execute({
      args: {
        image_url: '/tmp/file.png',
        coordinates: [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1]
        ]
      },
      sourceIdPrefix: 'test'
    })) as { status: string; message: string }

    expect(result.status).toBe('error')
    expect(result.message).toContain('Main window not available')
  })

  it('sends georeferenced image with converted file data URI', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1800)
    mocks.convertImageFileToDataUri.mockResolvedValue('data:image/png;base64,AAA')
    const send = vi.fn()
    const recordLayer = vi.fn()
    const { registry, entries } = createRegistry()

    registerVisualizationTools(registry, {
      mapLayerTracker: {
        getMainWindow: () => ({ webContents: { send } }),
        recordLayer
      } as never
    })

    const tool = entries.get('add_georeferenced_image_layer')
    const result = (await tool?.execute({
      args: {
        image_url: '/tmp/local.png',
        coordinates: [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1]
        ],
        fit_bounds: true
      },
      sourceIdPrefix: 'test'
    })) as { status: string; sourceId: string; layerId: string }

    expect(mocks.convertImageFileToDataUri).toHaveBeenCalledWith('/tmp/local.png')
    expect(send).toHaveBeenCalledWith(
      'ctg:map:addGeoreferencedImageLayer',
      expect.objectContaining({
        imageUrl: 'data:image/png;base64,AAA',
        sourceId: 'test-add_georeferenced_image_layer-source-1800',
        layerId: 'test-add_georeferenced_image_layer-layer-1800'
      })
    )
    expect(recordLayer).toHaveBeenCalled()
    expect(result.status).toBe('success')
  })

  it('creates buffer feature layers and tracks them', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1900)
    mocks.createGeoJSONBuffer.mockReturnValue({
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
            [0, 0]
          ]
        ]
      },
      properties: {}
    })

    const sendFeatureToMap = vi.fn()
    const recordLayer = vi.fn()
    const { registry, entries } = createRegistry()

    registerVisualizationTools(registry, {
      mapLayerTracker: { sendFeatureToMap, recordLayer } as never
    })

    const tool = entries.get('create_map_buffer')
    const result = (await tool?.execute({
      args: { longitude: 10, latitude: 20, radius: 100, units: 'meters' },
      sourceIdPrefix: 'test'
    })) as { status: string; sourceId: string }

    expect(sendFeatureToMap).toHaveBeenCalled()
    expect(recordLayer).toHaveBeenCalled()
    expect(result.status).toBe('success')
    expect(result.sourceId).toBe('test-create_map_buffer-1900')
  })
})
