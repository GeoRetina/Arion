/**
 * Shapefile Processor
 *
 * Handles processing of Shapefile datasets for layer import.
 * Uses managed local-file imports for `.shp` datasets and shpjs for ZIP archives.
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
import { waitForNextPaint } from '@/lib/wait-for-next-paint'
import {
  buildLayerFromManagedVectorAsset,
  registerManagedVectorAssetFromFile
} from './managed-vector-asset'

export type ShapefileImportStage = 'resolving' | 'importing' | 'parsing' | 'finalizing'

export interface ShapefileImportProgressStatus {
  stage: ShapefileImportStage
  progress: number
  message: string
}

export class ShapefileProcessor {
  /**
   * Process a shapefile dataset and create a layer definition.
   */
  static async processFile(
    file: File,
    fileName: string,
    onProgress?: (status: ShapefileImportProgressStatus) => void
  ): Promise<LayerDefinition> {
    const registeredAsset = await registerManagedVectorAssetFromFile(file, 'shapefile', {
      onResolveStart: () =>
        onProgress?.({
          stage: 'resolving',
          progress: 12,
          message: 'Resolving local shapefile path'
        }),
      onRegisterStart: (sourcePath) =>
        onProgress?.({
          stage: 'importing',
          progress: 45,
          message: sourcePath.toLowerCase().endsWith('.shp')
            ? 'Loading shapefile dataset from disk'
            : 'Loading shapefile archive from disk'
        })
    })
    if (registeredAsset) {
      onProgress?.({
        stage: 'finalizing',
        progress: 88,
        message: `Preparing ${registeredAsset.asset.featureCount.toLocaleString()} imported features`
      })

      return buildLayerFromManagedVectorAsset(
        registeredAsset.asset,
        fileName,
        registeredAsset.sourcePath
      )
    }

    if (file.name.toLowerCase().endsWith('.shp')) {
      throw new Error(
        'Standalone .shp imports require access to the local companion shapefile files. Try importing the local file again or use a ZIP archive.'
      )
    }

    onProgress?.({
      stage: 'importing',
      progress: 28,
      message: 'Reading shapefile archive'
    })
    await waitForNextPaint()

    const arrayBuffer = await file.arrayBuffer()
    try {
      onProgress?.({
        stage: 'parsing',
        progress: 62,
        message: 'Parsing shapefile geometry and attributes'
      })
      await waitForNextPaint()

      const geoJsonData = await shp(arrayBuffer)
      const normalizedData = normalizeShapefileOutput(geoJsonData)
      assertFeatureCollectionHasFeatures(normalizedData, 'Shapefile contains no features')
      onProgress?.({
        stage: 'finalizing',
        progress: 88,
        message: `Preparing ${normalizedData.features.length.toLocaleString()} imported features`
      })
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
