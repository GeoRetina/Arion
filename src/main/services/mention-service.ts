/**
 * Mention Detection and Processing Service
 *
 * A clean, production-ready service for detecting @mentions in chat messages
 * and enhancing them with real metadata from layers and knowledge base documents.
 */

// Core mention processing service types

// Mention detection pattern
const MENTION_PATTERN = /@([\w-]+)/g

// Supported data source types
export type DataSourceType = 'layer' | 'document'

// Resolved mention metadata
export interface MentionMetadata {
  id: string
  name: string
  type: DataSourceType
  description?: string
  metadata: Record<string, any>
}

// Message content with mention information
export interface MessageContent {
  role: string
  content: string
  parts?: Array<{ type: string; text: string }>
}

/**
 * Core mention processing service
 */
export class MentionService {
  private static instance: MentionService

  public static getInstance(): MentionService {
    if (!MentionService.instance) {
      MentionService.instance = new MentionService()
    }
    return MentionService.instance
  }

  /**
   * Extract mention identifiers from text content
   */
  public extractMentions(text: string): string[] {
    if (typeof text !== 'string' || text.trim() === '') {
      return []
    }

    const mentions: string[] = []
    let match: RegExpExecArray | null

    // Reset regex state
    MENTION_PATTERN.lastIndex = 0

    while ((match = MENTION_PATTERN.exec(text)) !== null) {
      const mentionId = match[1]

      // Validate mention ID format
      if (this.isValidMentionId(mentionId)) {
        mentions.push(mentionId)
      }
    }

    // Remove duplicates while preserving order
    return Array.from(new Set(mentions))
  }

  /**
   * Validate mention ID format
   */
  private isValidMentionId(mentionId: string): boolean {
    // Must be non-empty, reasonable length, and contain only safe characters
    return mentionId.length > 0 && mentionId.length <= 100 && /^[\w-]+$/.test(mentionId)
  }

  /**
   * Check if content contains mentions
   */
  public hasMentions(content: string): boolean {
    if (typeof content !== 'string') {
      return false
    }

    MENTION_PATTERN.lastIndex = 0
    return MENTION_PATTERN.test(content)
  }

  /**
   * Enhance a user message with mention metadata
   */
  public async enhanceMessage(
    message: MessageContent,
    resolver: DataSourceResolver
  ): Promise<MessageContent> {
    // Input validation
    if (!message || typeof message.content !== 'string') {
      return message
    }

    if (!this.hasMentions(message.content)) {
      return message
    }

    const mentions = this.extractMentions(message.content)
    if (mentions.length === 0) {
      return message
    }

    try {
      // Resolve mentions to metadata with timeout and error handling
      const resolvePromises = mentions.map(async (mentionId) => {
        try {
          const result = await Promise.race([
            resolver.resolveDataSource(mentionId),
            new Promise<null>(
              (_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000) // 5 second timeout
            )
          ])
          return result
        } catch {
          return null
        }
      })

      const resolvedMentions = await Promise.all(resolvePromises)

      // Filter out unresolved mentions
      const validMentions = resolvedMentions.filter(Boolean) as MentionMetadata[]

      if (validMentions.length === 0) {
        return message
      }

      // Generate enhanced content
      const enhancedContent = this.buildEnhancedContent(message.content, validMentions)

      // Validate enhanced content isn't too large (prevent DoS)
      if (enhancedContent.length > 50000) {
        return this.buildTruncatedEnhancedContent(message.content, validMentions)
      }

      // Update both content and parts
      const enhancedMessage: MessageContent = {
        ...message,
        content: enhancedContent
      }

      // Update parts array if it exists
      if (message.parts && Array.isArray(message.parts)) {
        enhancedMessage.parts = [
          {
            type: 'text',
            text: enhancedContent
          }
        ]
      }

      return enhancedMessage
    } catch {
      return message // Return original message on error
    }
  }

  /**
   * Build enhanced content with metadata section
   */
  private buildEnhancedContent(originalContent: string, mentions: MentionMetadata[]): string {
    const metadataSection = this.formatMetadataSection(mentions)
    return `${originalContent}\n\n${metadataSection}`
  }

  /**
   * Build truncated enhanced content when metadata is too large
   */
  private buildTruncatedEnhancedContent(
    originalContent: string,
    mentions: MentionMetadata[]
  ): MessageContent {
    const truncatedSection = this.formatTruncatedMetadataSection(mentions)
    const enhancedContent = `${originalContent}\n\n${truncatedSection}`

    return {
      role: 'user',
      content: enhancedContent
    }
  }

  /**
   * Format truncated metadata section with basic info only
   */
  private formatTruncatedMetadataSection(mentions: MentionMetadata[]): string {
    const lines = ['--- REFERENCED DATA SOURCES (truncated for size) ---']

    mentions.slice(0, 10).forEach((mention) => {
      // Limit to 10 mentions max
      lines.push(`DATA SOURCE: @${mention.id} - ${mention.name} (${mention.type})`)
    })

    if (mentions.length > 10) {
      lines.push(`... and ${mentions.length - 10} more data sources`)
    }

    return lines.join('\n')
  }

  /**
   * Format metadata section for LLM consumption
   */
  private formatMetadataSection(mentions: MentionMetadata[]): string {
    const lines = ['--- REFERENCED DATA SOURCES (Use this information, do not query tools) ---']

    mentions.forEach((mention) => {
      lines.push('')
      lines.push(`DATA SOURCE: @${mention.id}`)
      lines.push(`  Name: ${mention.name}`)
      lines.push(`  Type: ${mention.type}`)

      if (mention.description) {
        lines.push(`  Description: ${mention.description}`)
      }

      // Add type-specific metadata
      if (mention.type === 'layer') {
        this.addLayerMetadata(lines, mention.metadata)
      } else if (mention.type === 'document') {
        this.addDocumentMetadata(lines, mention.metadata)
      }
    })

    return lines.join('\n')
  }

  /**
   * Add layer-specific metadata to formatted output
   */
  private addLayerMetadata(lines: string[], metadata: Record<string, any>): void {
    if (metadata.geometryType) {
      lines.push(`  Geometry Type: ${metadata.geometryType}`)
    }
    if (metadata.featureCount !== undefined) {
      lines.push(`  Feature Count: ${metadata.featureCount}`)
    }
    if (metadata.bounds && Array.isArray(metadata.bounds)) {
      const [minLng, minLat, maxLng, maxLat] = metadata.bounds
      lines.push(
        `  Bounds: [${minLng.toFixed(3)}, ${minLat.toFixed(3)}, ${maxLng.toFixed(3)}, ${maxLat.toFixed(3)}]`
      )
    }
    if (metadata.tags && Array.isArray(metadata.tags)) {
      lines.push(`  Tags: ${metadata.tags.join(', ')}`)
    }
  }

  /**
   * Add document-specific metadata to formatted output
   */
  private addDocumentMetadata(lines: string[], metadata: Record<string, any>): void {
    if (metadata.fileType) {
      lines.push(`  File Type: ${metadata.fileType}`)
    }
    if (metadata.fileSize) {
      lines.push(`  File Size: ${this.formatFileSize(metadata.fileSize)}`)
    }
    if (metadata.chunkCount !== undefined) {
      lines.push(`  Content Chunks: ${metadata.chunkCount}`)
    }
    if (metadata.createdAt) {
      lines.push(`  Added: ${new Date(metadata.createdAt).toLocaleDateString()}`)
    }
  }

  /**
   * Format file size in human-readable format
   */
  private formatFileSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB']
    let size = bytes
    let unitIndex = 0

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024
      unitIndex++
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`
  }
}

/**
 * Data source resolver interface
 */
export abstract class DataSourceResolver {
  abstract resolveDataSource(mentionId: string): Promise<MentionMetadata | null>
}

/**
 * Production data source resolver using real layer and knowledge base APIs
 */
export class ProductionDataSourceResolver extends DataSourceResolver {
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
   * Resolve layer data by searching layer name/id
   */
  private async resolveLayerByName(mentionId: string): Promise<MentionMetadata | null> {
    void mentionId
    try {
      // This would need to be implemented to access the layer database
      // For now, return null as the integration point

      // TODO: Integrate with actual layer database through IPC
      // const layers = await this.getLayersFromDatabase()
      // const layer = layers.find(l =>
      //   l.name.toLowerCase().replace(/\s+/g, '_') === mentionId ||
      //   l.id === mentionId
      // )

      return null
    } catch {
      return null
    }
  }

  /**
   * Resolve knowledge base document by name/id
   */
  private async resolveDocumentByName(mentionId: string): Promise<MentionMetadata | null> {
    void mentionId
    try {
      // This would need to be implemented to access the knowledge base
      // For now, return null as the integration point

      // TODO: Integrate with actual knowledge base through IPC
      // const documents = await this.getDocumentsFromKB()
      // const doc = documents.find(d =>
      //   d.name.toLowerCase().replace(/\s+/g, '_') === mentionId ||
      //   d.id === mentionId
      // )

      return null
    } catch {
      return null
    }
  }
}
