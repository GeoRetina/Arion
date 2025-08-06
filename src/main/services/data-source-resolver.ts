/**
 * Production Data Source Resolver
 * 
 * Integrates with existing application services and extracts real metadata
 * from layers and documents using existing geospatial utilities.
 */

import { DataSourceResolver, type MentionMetadata } from './mention-service'
import type { KnowledgeBaseService } from './knowledge-base-service'
import type { LayerDefinition } from '../../shared/types/layer-types'
import { fromFile as geoTiffFromFile } from 'geotiff'
import fs from 'fs'

/**
 * Production implementation that integrates with existing services and utilities
 */
export class ProductionDataSourceResolver extends DataSourceResolver {
  private knowledgeBaseService: KnowledgeBaseService | null = null
  private layerDbManager: any = null

  constructor(knowledgeBaseService?: KnowledgeBaseService, layerDbManager?: any) {
    super()
    this.knowledgeBaseService = knowledgeBaseService || null
    this.layerDbManager = layerDbManager || null
  }

  /**
   * Main resolver method
   */
  async resolveDataSource(mentionId: string): Promise<MentionMetadata | null> {
    // Try layers first
    const layerMetadata = await this.resolveLayerByName(mentionId)
    if (layerMetadata) {
      return layerMetadata
    }

    // Try knowledge base documents  
    const documentMetadata = await this.resolveDocumentByName(mentionId)
    if (documentMetadata) {
      return documentMetadata
    }

    return null
  }

  /**
   * Resolve layer by name or ID from the layer store
   */
  private async resolveLayerByName(mentionId: string): Promise<MentionMetadata | null> {
    try {
      
      // Get all layers from the layer store (if available)
      // Note: In main process, we need to access layers through IPC or service
      // For now, we'll implement a service-based approach
      const layers = await this.getAllLayers()
      
      // Find matching layer
      const matchingLayer = layers.find(layer => 
        layer.id === mentionId ||
        this.matchesLayerName(layer.name, mentionId) ||
        layer.name.toLowerCase().includes(mentionId.toLowerCase())
      )
      
      if (!matchingLayer) {
        return null
      }
      
      
      // Extract metadata from the layer using existing utilities
      return await this.extractLayerMetadata(matchingLayer, mentionId)
    } catch (error) {
      return null
    }
  }

  /**
   * Check if layer name matches mention criteria
   */
  private matchesLayerName(layerName: string, mentionId: string): boolean {
    const lowerName = layerName.toLowerCase()
    const lowerMention = mentionId.toLowerCase()
    
    return (
      lowerName.replace(/\s+/g, '_') === lowerMention ||
      lowerName.replace(/\s+/g, '-') === lowerMention ||
      lowerName.includes(lowerMention)
    )
  }


  /**
   * Resolve knowledge base document by name or ID
   */
  private async resolveDocumentByName(mentionId: string): Promise<MentionMetadata | null> {
    if (!this.knowledgeBaseService) {
      return null
    }

    try {
      // Use the knowledge base service to get all documents
      const documents = await this.knowledgeBaseService.getAllKnowledgeBaseDocuments()
      
      // Find document that matches the mention
      const document = documents.find(doc => this.matchesDocumentMention(doc, mentionId))
      
      if (!document) {
        return null
      }

      return {
        id: mentionId, // Use mention ID for consistency
        name: document.name,
        type: 'document',
        description: document.description || `${document.file_type} document`,
        metadata: {
          fileName: document.original_file_name,
          fileType: document.file_type,
          fileSize: document.file_size,
          chunkCount: document.chunk_count,
          createdAt: document.created_at,
          updatedAt: document.updated_at,
          folderId: document.folder_id
        }
      }
    } catch (error) {
      return null
    }
  }

  /**
   * Check if document matches mention criteria
   */
  private matchesDocumentMention(document: any, mentionId: string): boolean {
    const lowerMentionId = mentionId.toLowerCase()
    const lowerName = document.name.toLowerCase()
    const lowerFileName = document.original_file_name?.toLowerCase() || ''
    
    return (
      document.id === mentionId ||
      lowerName.replace(/\s+/g, '_') === lowerMentionId ||
      lowerName.replace(/\s+/g, '-') === lowerMentionId ||
      lowerFileName.replace(/\s+/g, '_') === lowerMentionId ||
      lowerName.includes(lowerMentionId) ||
      lowerFileName.includes(lowerMentionId)
    )
  }

  /**
   * Get all layers from the layer database
   */
  private async getAllLayers(): Promise<LayerDefinition[]> {
    if (!this.layerDbManager) {
      return []
    }
    
    try {
      return this.layerDbManager.getAllLayers()
    } catch (error) {
      return []
    }
  }

  /**
   * Extract metadata from a layer definition using existing utilities
   */
  private async extractLayerMetadata(layer: LayerDefinition, mentionId: string): Promise<MentionMetadata> {
    try {
      const baseMetadata: MentionMetadata = {
        id: mentionId,
        name: layer.name,
        type: 'layer',
        description: layer.metadata.description || `${layer.type} layer`,
        metadata: {
          layerType: layer.type,
          sourceType: layer.sourceConfig.type,
          visibility: layer.visibility,
          opacity: layer.opacity,
          created: layer.createdAt.toISOString(),
          lastUpdated: layer.updatedAt.toISOString()
        }
      }

      // Extract additional metadata based on layer type
      if (layer.type === 'vector') {
        const vectorMetadata = await this.extractVectorMetadata(layer)
        baseMetadata.metadata = { ...baseMetadata.metadata, ...vectorMetadata }
      } else if (layer.type === 'raster') {
        const rasterMetadata = await this.extractRasterMetadata(layer)
        baseMetadata.metadata = { ...baseMetadata.metadata, ...rasterMetadata }
      }

      return baseMetadata
    } catch (error) {
      
      // Return basic metadata if extraction fails
      return {
        id: mentionId,
        name: layer.name,
        type: 'layer',
        description: `${layer.type} layer`,
        metadata: {
          layerType: layer.type,
          sourceType: layer.sourceConfig.type,
          error: 'Failed to extract detailed metadata'
        }
      }
    }
  }

  /**
   * Extract metadata from vector layer using existing utilities
   */
  private async extractVectorMetadata(layer: LayerDefinition): Promise<Record<string, any>> {
    const metadata: Record<string, any> = {
      geometryType: layer.metadata.geometryType,
      featureCount: layer.metadata.featureCount,
      bounds: layer.metadata.bounds,
      crs: layer.metadata.crs || 'EPSG:4326'
    }

    // If we have GeoJSON data directly in the source config
    if (layer.sourceConfig.type === 'geojson' && typeof layer.sourceConfig.data === 'object') {
      const geoJsonData = layer.sourceConfig.data as any
      if (geoJsonData.features && Array.isArray(geoJsonData.features)) {
        metadata.actualFeatureCount = geoJsonData.features.length
        
        // Extract geometry types from features
        const geometryTypes = new Set()
        geoJsonData.features.forEach((feature: any) => {
          if (feature.geometry && feature.geometry.type) {
            geometryTypes.add(feature.geometry.type)
          }
        })
        metadata.geometryTypes = Array.from(geometryTypes)
        
        // Extract attribute information
        if (geoJsonData.features.length > 0) {
          const sampleFeature = geoJsonData.features[0]
          if (sampleFeature.properties) {
            metadata.attributeKeys = Object.keys(sampleFeature.properties)
            metadata.sampleAttributes = sampleFeature.properties
          }
        }
      }
    }

    return metadata
  }

  /**
   * Extract metadata from raster layer using existing geotiff utilities
   */
  private async extractRasterMetadata(layer: LayerDefinition): Promise<Record<string, any>> {
    const metadata: Record<string, any> = {
      bounds: layer.metadata.bounds,
      crs: layer.metadata.crs,
      layerType: 'raster',
      sourceType: layer.sourceConfig.type
    }

    // If we have a file path or blob URL, try to extract basic metadata
    if (typeof layer.sourceConfig.data === 'string') {
      const dataSource = layer.sourceConfig.data
      
      // Handle file paths
      if (!dataSource.startsWith('blob:') && fs.existsSync(dataSource) && 
          dataSource.toLowerCase().includes('.tif')) {
        try {
          const tiff = await geoTiffFromFile(dataSource)
          const image = await tiff.getImage()
          
          metadata.width = image.getWidth()
          metadata.height = image.getHeight()
          metadata.bandCount = image.getSamplesPerPixel()
          metadata.pixelSize = {
            x: Math.abs(image.getResolution()[0]),
            y: Math.abs(image.getResolution()[1])
          }
          
          // Get GeoTIFF-specific metadata
          const bbox = image.getBoundingBox()
          if (bbox) {
            metadata.geotiffBounds = bbox
          }
          
          // Get band information
          metadata.bands = []
          for (let i = 0; i < image.getSamplesPerPixel(); i++) {
            metadata.bands.push({
              index: i + 1,
              description: `Band ${i + 1}`
            })
          }
          
        } catch (error) {
          metadata.extractionError = 'Failed to read GeoTIFF metadata'
        }
      } 
      // Handle blob URLs (imported raster files)
      else if (dataSource.startsWith('blob:')) {
        metadata.dataType = 'blob'
        metadata.note = 'Detailed metadata extraction not available for blob URLs'
        metadata.description = 'Imported raster file (blob URL)'
      }
    }

    return metadata
  }

  /**
   * Clean up resources
   */
  cleanup(): void {
    this.knowledgeBaseService = null
    this.layerDbManager = null
  }
}

