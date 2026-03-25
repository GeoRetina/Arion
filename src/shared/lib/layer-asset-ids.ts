import type { LayerDefinition } from '../types/layer-types'

function getLayerAssetId(
  layer: Pick<LayerDefinition, 'sourceConfig'>,
  key: 'rasterAssetId' | 'vectorAssetId'
): string | null {
  const assetId = layer.sourceConfig.options?.[key]
  return typeof assetId === 'string' && assetId.length > 0 ? assetId : null
}

export function getRasterAssetId(layer: Pick<LayerDefinition, 'sourceConfig'>): string | null {
  return getLayerAssetId(layer, 'rasterAssetId')
}

export function getVectorAssetId(layer: Pick<LayerDefinition, 'sourceConfig'>): string | null {
  return getLayerAssetId(layer, 'vectorAssetId')
}
