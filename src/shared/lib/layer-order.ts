import type { LayerDefinition } from '../types/layer-types'

export function sortLayersByDisplayOrder(layers: Iterable<LayerDefinition>): LayerDefinition[] {
  return Array.from(layers).sort((a, b) => {
    if (a.zIndex !== b.zIndex) {
      return b.zIndex - a.zIndex
    }

    return b.createdAt.getTime() - a.createdAt.getTime()
  })
}

export function sortLayersForMapSync(layers: Iterable<LayerDefinition>): LayerDefinition[] {
  return Array.from(layers).sort((a, b) => {
    if (a.zIndex !== b.zIndex) {
      return a.zIndex - b.zIndex
    }

    return a.createdAt.getTime() - b.createdAt.getTime()
  })
}
