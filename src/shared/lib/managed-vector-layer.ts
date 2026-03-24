import { v4 as uuidv4 } from 'uuid'
import { LayerStyleFactory } from './layer-style-factory'
import type { LayerCreateInput, LayerDefinition, LayerMetadata } from '../types/layer-types'
import type { GeoJsonFeatureCollection } from './vector-import-utils'

export interface ManagedVectorAssetDescriptor {
  assetId: string
  dataUrl: string
  metadata: LayerMetadata
}

export function buildManagedVectorLayerInput(
  asset: ManagedVectorAssetDescriptor,
  layerName: string,
  sourcePath: string
): Omit<LayerCreateInput, 'sourceId'> {
  return {
    name: layerName,
    type: 'vector',
    sourceConfig: {
      type: 'geojson',
      data: asset.dataUrl,
      options: {
        vectorAssetId: asset.assetId,
        vectorSourcePath: sourcePath
      }
    },
    style: LayerStyleFactory.createVectorStyle(asset.metadata.geometryType),
    visibility: true,
    opacity: 1,
    zIndex: 0,
    metadata: asset.metadata,
    isLocked: false,
    createdBy: 'import'
  }
}

export function buildManagedVectorLayerDefinition(
  asset: ManagedVectorAssetDescriptor,
  layerName: string,
  sourcePath: string
): LayerDefinition {
  return {
    ...buildManagedVectorLayerInput(asset, layerName, sourcePath),
    id: uuidv4(),
    sourceId: `source-${uuidv4()}`,
    createdAt: new Date(),
    updatedAt: new Date()
  }
}

export function buildInlineVectorLayerDefinition(
  geoJson: GeoJsonFeatureCollection,
  metadata: LayerMetadata,
  layerName: string
): LayerDefinition {
  return {
    ...buildManagedVectorLayerDefinition(
      {
        assetId: `inline-${uuidv4()}`,
        dataUrl: '',
        metadata
      },
      layerName,
      ''
    ),
    sourceConfig: {
      type: 'geojson',
      data: geoJson
    }
  }
}
