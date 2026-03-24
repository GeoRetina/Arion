/**
 * Shapefile Processor
 *
 * Handles processing of Shapefile (ZIP) archives for layer import.
 * Uses shpjs library to parse shapefiles and convert to GeoJSON.
 */

import shp from 'shpjs'
import { buildInlineVectorLayerDefinition } from '../../../../../shared/lib/managed-vector-layer'
import {
  assertFeatureCollectionHasFeatures,
  buildShapefileMetadata,
  normalizeShapefileOutput,
  summarizeFeatureCollections,
  type GeoJsonFeatureCollection
} from '../../../../../shared/lib/vector-import-utils'
import type { LayerDefinition } from '../../../../../shared/types/layer-types'
import {
  buildLayerFromManagedVectorAsset,
  registerManagedVectorAssetFromFile
} from './managed-vector-asset'

export class ShapefileProcessor {
  /**
   * Process Shapefile (ZIP archive) and create layer definition
   */
  static async processFile(file: File, fileName: string): Promise<LayerDefinition> {
    const registeredAsset = await registerManagedVectorAssetFromFile(file, 'shapefile')
    if (registeredAsset) {
      return buildLayerFromManagedVectorAsset(
        registeredAsset.asset,
        fileName,
        registeredAsset.sourcePath
      )
    }

    const arrayBuffer = await file.arrayBuffer()
    try {
      const geoJsonData = await shp(arrayBuffer)
      const normalizedData = normalizeShapefileOutput(geoJsonData)
      assertFeatureCollectionHasFeatures(normalizedData, 'Shapefile contains no features')
      const metadata = buildShapefileMetadata(normalizedData)

      return buildInlineVectorLayerDefinition(normalizedData, metadata, fileName)
    } catch (error) {
      throw new Error(
        `Failed to parse shapefile: ${error instanceof Error ? error.message : 'Unknown parsing error'}`
      )
    }
  }

  /**
   * Extract information about shapefile components
   */
  static async analyzeShapefileContents(file: File): Promise<{
    shapefileCount: number
    totalFeatures: number
    geometryTypes: string[]
    hasAttributes: boolean
    attributeKeys: string[]
  }> {
    const arrayBuffer = await file.arrayBuffer()
    const shpjsOutput = await shp(arrayBuffer)
    const shapefiles = (Array.isArray(shpjsOutput) ? shpjsOutput : [shpjsOutput])
      .map((shapefile) => normalizeShapefileOutput(shapefile))
      .filter((shapefile): shapefile is GeoJsonFeatureCollection => Boolean(shapefile))
    const summary = summarizeFeatureCollections(shapefiles)

    return {
      shapefileCount: shapefiles.length,
      totalFeatures: summary.featureCount,
      geometryTypes: summary.geometryTypes,
      hasAttributes: summary.hasProperties,
      attributeKeys: summary.propertyKeys
    }
  }
}
