/**
 * GeoJSON Processor
 *
 * Handles processing of GeoJSON files for layer import.
 * Validates structure, normalizes format, and creates layer definitions.
 */

import { buildInlineVectorLayerDefinition } from '../../../../../shared/lib/managed-vector-layer'
import {
  buildGeoJsonMetadata,
  normalizeGeoJson,
  summarizeFeatureCollections
} from '../../../../../shared/lib/vector-import-utils'
import type { LayerDefinition } from '../../../../../shared/types/layer-types'
import {
  buildLayerFromManagedVectorAsset,
  registerManagedVectorAssetFromFile
} from './managed-vector-asset'

export class GeoJSONProcessor {
  /**
   * Process GeoJSON file and create layer definition
   */
  static async processFile(file: File, fileName: string): Promise<LayerDefinition> {
    const registeredAsset = await registerManagedVectorAssetFromFile(file, 'geojson')
    if (registeredAsset) {
      return buildLayerFromManagedVectorAsset(
        registeredAsset.asset,
        fileName,
        registeredAsset.sourcePath
      )
    }

    const text = await file.text()
    let geoJsonData: unknown
    try {
      geoJsonData = JSON.parse(text)
    } catch {
      throw new Error('Invalid JSON format')
    }

    const normalizedData = normalizeGeoJson(geoJsonData)
    const metadata = buildGeoJsonMetadata(normalizedData)

    return buildInlineVectorLayerDefinition(normalizedData, metadata, fileName)
  }

  /**
   * Extract summary information from GeoJSON
   */
  static getSummaryInfo(geoJsonData: unknown): {
    featureCount: number
    geometryTypes: string[]
    hasProperties: boolean
    propertyKeys: string[]
  } {
    const normalized = normalizeGeoJson(geoJsonData)
    const summary = summarizeFeatureCollections([normalized])

    return {
      featureCount: summary.featureCount,
      geometryTypes: summary.geometryTypes,
      hasProperties: summary.hasProperties,
      propertyKeys: summary.propertyKeys
    }
  }
}
