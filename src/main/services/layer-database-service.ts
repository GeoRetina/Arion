/**
 * Layer Database Service
 *
 * Handles all database operations for layers, groups, and related functionality.
 * Provides CRUD operations, search, and data persistence using SQLite.
 */

import Database from 'better-sqlite3'
import fs from 'fs'
import { join } from 'path'
import { app } from 'electron'
import type {
  LayerDefinition,
  LayerGroup,
  LayerSearchCriteria,
  LayerSearchResult,
  LayerError,
  LayerOperation,
  StylePreset,
  LayerPerformanceMetrics
} from '../../shared/types/layer-types'

export interface LayerDatabase {
  // Layer CRUD
  getAllLayers: () => LayerDefinition[]
  getLayerById: (id: string) => LayerDefinition | undefined
  getLayersByType: (type: 'raster' | 'vector') => LayerDefinition[]
  getLayersByGroup: (groupId: string | null) => LayerDefinition[]
  createLayer: (layer: Omit<LayerDefinition, 'id' | 'createdAt' | 'updatedAt'>) => LayerDefinition
  updateLayer: (id: string, updates: Partial<LayerDefinition>) => LayerDefinition
  deleteLayer: (id: string) => boolean

  // Group CRUD
  getAllGroups: () => LayerGroup[]
  getGroupById: (id: string) => LayerGroup | undefined
  createGroup: (
    group: Omit<LayerGroup, 'id' | 'createdAt' | 'updatedAt' | 'layerIds'>
  ) => LayerGroup
  updateGroup: (id: string, updates: Partial<LayerGroup>) => LayerGroup
  deleteGroup: (id: string, moveLayersTo?: string) => boolean

  // Search and filtering
  searchLayers: (criteria: LayerSearchCriteria) => LayerSearchResult

  // Operations and errors
  logOperation: (operation: LayerOperation) => void
  getOperations: (layerId?: string) => LayerOperation[]
  logError: (error: LayerError) => void
  getErrors: (layerId?: string) => LayerError[]
  clearErrors: (layerId?: string) => void

  // Style presets
  getAllStylePresets: () => StylePreset[]
  getStylePresetById: (id: string) => StylePreset | undefined
  createStylePreset: (preset: Omit<StylePreset, 'id' | 'createdAt' | 'updatedAt'>) => StylePreset
  deleteStylePreset: (id: string) => boolean

  // Performance metrics
  recordPerformanceMetrics: (metrics: LayerPerformanceMetrics) => void
  getPerformanceMetrics: (layerId?: string) => LayerPerformanceMetrics[]

  // Bulk operations
  bulkUpdateLayers: (updates: Array<{ id: string; changes: Partial<LayerDefinition> }>) => void
  exportLayers: (layerIds: string[]) => string
  importLayers: (data: string, targetGroupId?: string) => string[]

  // Utility
  close: () => void
}

export class LayerDatabaseService implements LayerDatabase {
  private db: Database.Database
  private statements: Record<string, Database.Statement> = {}

  constructor(dbPath: string) {
    this.db = new Database(dbPath)
    this.initializeDatabase()
    this.prepareStatements()
  }

  private initializeDatabase(): void {
    // Enable foreign keys and set pragmas
    this.db.pragma('foreign_keys = ON')
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('synchronous = NORMAL')

    // Check if migration is needed
    const migrations = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='layers'")
      .get()
    if (!migrations) {
      this.runMigration('add-layer-tables.sql')
    }
  }

  private runMigration(migrationFile: string): void {
    const migrationPath = this.getMigrationPath(migrationFile)

    try {
      const migration = fs.readFileSync(migrationPath, 'utf8')
      this.db.exec(migration)
      console.log(`Successfully applied migration: ${migrationFile}`)
    } catch (error) {
      console.error(`Failed to apply migration ${migrationFile}:`, error)
      throw new Error(`Database migration failed: ${migrationFile}`)
    }
  }

  private getMigrationPath(migrationFile: string): string {
    // In production builds, migration files are copied to out/database/migrations/
    // In development, they're in src/main/database/migrations/
    const possiblePaths = [
      join(process.cwd(), 'out/database/migrations', migrationFile),
      join(__dirname, '../../database/migrations', migrationFile),
      join(__dirname, '../database/migrations', migrationFile)
    ]

    for (const path of possiblePaths) {
      if (fs.existsSync(path)) {
        return path
      }
    }

    throw new Error(
      `Migration file not found: ${migrationFile}. Searched paths: ${possiblePaths.join(', ')}`
    )
  }

  private prepareStatements(): void {
    // Layer statements
    this.statements.getAllLayers = this.db.prepare(`
      SELECT * FROM layers ORDER BY z_index DESC, created_at DESC
    `)

    this.statements.getLayerById = this.db.prepare(`
      SELECT * FROM layers WHERE id = ?
    `)

    this.statements.getLayersByType = this.db.prepare(`
      SELECT * FROM layers WHERE type = ? ORDER BY z_index DESC, created_at DESC
    `)

    this.statements.getLayersByGroup = this.db.prepare(`
      SELECT * FROM layers WHERE group_id IS ? ORDER BY z_index DESC, created_at DESC
    `)

    this.statements.createLayer = this.db.prepare(`
      INSERT INTO layers (
        id, name, type, source_id, source_config, style_config, visibility, 
        opacity, z_index, metadata, group_id, is_locked, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    this.statements.updateLayer = this.db.prepare(`
      UPDATE layers SET 
        name = COALESCE(?, name),
        type = COALESCE(?, type),
        source_id = COALESCE(?, source_id),
        source_config = COALESCE(?, source_config),
        style_config = COALESCE(?, style_config),
        visibility = COALESCE(?, visibility),
        opacity = COALESCE(?, opacity),
        z_index = COALESCE(?, z_index),
        metadata = COALESCE(?, metadata),
        group_id = COALESCE(?, group_id),
        is_locked = COALESCE(?, is_locked),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)

    this.statements.deleteLayer = this.db.prepare(`
      DELETE FROM layers WHERE id = ?
    `)

    // Group statements
    this.statements.getAllGroups = this.db.prepare(`
      SELECT * FROM layer_groups ORDER BY display_order, name
    `)

    this.statements.getGroupById = this.db.prepare(`
      SELECT * FROM layer_groups WHERE id = ?
    `)

    this.statements.createGroup = this.db.prepare(`
      INSERT INTO layer_groups (id, name, parent_id, display_order, expanded, color, description)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)

    this.statements.updateGroup = this.db.prepare(`
      UPDATE layer_groups SET
        name = COALESCE(?, name),
        parent_id = COALESCE(?, parent_id),
        display_order = COALESCE(?, display_order),
        expanded = COALESCE(?, expanded),
        color = COALESCE(?, color),
        description = COALESCE(?, description),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)

    this.statements.deleteGroup = this.db.prepare(`
      DELETE FROM layer_groups WHERE id = ?
    `)

    // Operations and errors
    this.statements.logOperation = this.db.prepare(`
      INSERT INTO layer_operations (layer_id, operation_type, changes, user_id)
      VALUES (?, ?, ?, ?)
    `)

    this.statements.getOperations = this.db.prepare(`
      SELECT * FROM layer_operations 
      WHERE layer_id IS ? OR ? IS NULL
      ORDER BY timestamp DESC LIMIT 100
    `)

    this.statements.logError = this.db.prepare(`
      INSERT INTO layer_errors (layer_id, error_code, error_message, error_details)
      VALUES (?, ?, ?, ?)
    `)

    this.statements.getErrors = this.db.prepare(`
      SELECT * FROM layer_errors 
      WHERE (layer_id IS ? OR ? IS NULL) AND resolved = 0
      ORDER BY timestamp DESC
    `)

    this.statements.clearErrors = this.db.prepare(`
      UPDATE layer_errors SET resolved = 1 
      WHERE layer_id IS ? OR ? IS NULL
    `)

    // Performance metrics
    this.statements.recordMetrics = this.db.prepare(`
      INSERT INTO layer_performance_metrics (layer_id, load_time, render_time, memory_usage, feature_count)
      VALUES (?, ?, ?, ?, ?)
    `)

    this.statements.getMetrics = this.db.prepare(`
      SELECT * FROM layer_performance_metrics 
      WHERE layer_id IS ? OR ? IS NULL
      ORDER BY timestamp DESC LIMIT 100
    `)

    // Style presets
    this.statements.getAllPresets = this.db.prepare(`
      SELECT * FROM style_presets ORDER BY is_built_in DESC, name
    `)

    this.statements.getPresetById = this.db.prepare(`
      SELECT * FROM style_presets WHERE id = ?
    `)

    this.statements.createPreset = this.db.prepare(`
      INSERT INTO style_presets (id, name, description, layer_type, geometry_type, style_config, preview, is_built_in, tags)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    this.statements.deletePreset = this.db.prepare(`
      DELETE FROM style_presets WHERE id = ? AND is_built_in = 0
    `)
  }

  // Layer CRUD implementations
  getAllLayers(): LayerDefinition[] {
    const rows = this.statements.getAllLayers.all()
    return rows.map((row) => this.rowToLayer(row))
  }

  getLayerById(id: string): LayerDefinition | undefined {
    const row = this.statements.getLayerById.get(id)
    return row ? this.rowToLayer(row) : undefined
  }

  getLayersByType(type: 'raster' | 'vector'): LayerDefinition[] {
    const rows = this.statements.getLayersByType.all(type)
    return rows.map((row) => this.rowToLayer(row))
  }

  getLayersByGroup(groupId: string | null): LayerDefinition[] {
    const rows = this.statements.getLayersByGroup.all(groupId)
    return rows.map((row) => this.rowToLayer(row))
  }

  createLayer(layer: Omit<LayerDefinition, 'id' | 'createdAt' | 'updatedAt'>): LayerDefinition {
    const id = this.generateId()
    const now = new Date()

    this.statements.createLayer.run(
      id,
      layer.name,
      layer.type,
      layer.sourceId,
      JSON.stringify(layer.sourceConfig),
      JSON.stringify(layer.style),
      layer.visibility ? 1 : 0,
      layer.opacity,
      layer.zIndex,
      JSON.stringify(layer.metadata),
      layer.groupId || null,
      layer.isLocked ? 1 : 0,
      layer.createdBy
    )

    return {
      ...layer,
      id,
      createdAt: now,
      updatedAt: now
    }
  }

  updateLayer(id: string, updates: Partial<LayerDefinition>): LayerDefinition {
    this.statements.updateLayer.run(
      updates.name ?? null,
      updates.type ?? null,
      updates.sourceId ?? null,
      updates.sourceConfig ? JSON.stringify(updates.sourceConfig) : null,
      updates.style ? JSON.stringify(updates.style) : null,
      updates.visibility !== undefined ? (updates.visibility ? 1 : 0) : null,
      updates.opacity ?? null,
      updates.zIndex ?? null,
      updates.metadata ? JSON.stringify(updates.metadata) : null,
      updates.groupId ?? null,
      updates.isLocked !== undefined ? (updates.isLocked ? 1 : 0) : null,
      id
    )

    const updated = this.getLayerById(id)
    if (!updated) {
      throw new Error(`Layer not found after update: ${id}`)
    }

    return updated
  }

  deleteLayer(id: string): boolean {
    const result = this.statements.deleteLayer.run(id)
    return result.changes > 0
  }

  // Group CRUD implementations
  getAllGroups(): LayerGroup[] {
    const rows = this.statements.getAllGroups.all()
    return rows.map((row) => this.rowToGroup(row))
  }

  getGroupById(id: string): LayerGroup | undefined {
    const row = this.statements.getGroupById.get(id)
    return row ? this.rowToGroup(row) : undefined
  }

  createGroup(group: Omit<LayerGroup, 'id' | 'createdAt' | 'updatedAt' | 'layerIds'>): LayerGroup {
    const id = this.generateId()
    const now = new Date()

    this.statements.createGroup.run(
      id,
      group.name,
      group.parentId || null,
      group.displayOrder,
      group.expanded ? 1 : 0,
      group.color || null,
      group.description || null
    )

    return {
      ...group,
      id,
      layerIds: [], // Will be populated dynamically
      createdAt: now,
      updatedAt: now
    }
  }

  updateGroup(id: string, updates: Partial<LayerGroup>): LayerGroup {
    this.statements.updateGroup.run(
      updates.name || null,
      updates.parentId !== undefined ? updates.parentId : null,
      updates.displayOrder !== undefined ? updates.displayOrder : null,
      updates.expanded !== undefined ? (updates.expanded ? 1 : 0) : null,
      updates.color !== undefined ? updates.color : null,
      updates.description !== undefined ? updates.description : null,
      id
    )

    const updated = this.getGroupById(id)
    if (!updated) {
      throw new Error(`Group not found after update: ${id}`)
    }

    return updated
  }

  deleteGroup(id: string, moveLayersTo?: string): boolean {
    const tx = this.db.transaction(() => {
      // Move or orphan layers in this group
      if (moveLayersTo) {
        this.db.prepare('UPDATE layers SET group_id = ? WHERE group_id = ?').run(moveLayersTo, id)
      } else {
        this.db.prepare('UPDATE layers SET group_id = NULL WHERE group_id = ?').run(id)
      }

      // Delete the group
      return this.statements.deleteGroup.run(id)
    })

    const result = tx()
    return result.changes > 0
  }

  // Search implementation
  searchLayers(criteria: LayerSearchCriteria): LayerSearchResult {
    const startTime = Date.now()
    let query = `
      SELECT l.*, lg.name as group_name 
      FROM layers l 
      LEFT JOIN layer_groups lg ON l.group_id = lg.id 
      WHERE 1=1
    `
    const params: any[] = []

    if (criteria.query) {
      query += ` AND (l.name LIKE ? OR JSON_EXTRACT(l.metadata, '$.description') LIKE ?)`
      const searchTerm = `%${criteria.query}%`
      params.push(searchTerm, searchTerm)
    }

    if (criteria.type) {
      query += ` AND l.type = ?`
      params.push(criteria.type)
    }

    if (criteria.createdBy) {
      query += ` AND l.created_by = ?`
      params.push(criteria.createdBy)
    }

    if (criteria.groupId) {
      query += ` AND l.group_id = ?`
      params.push(criteria.groupId)
    }

    if (criteria.dateRange) {
      query += ` AND l.created_at BETWEEN ? AND ?`
      params.push(criteria.dateRange.start.toISOString(), criteria.dateRange.end.toISOString())
    }

    query += ` ORDER BY l.z_index DESC, l.created_at DESC`

    const stmt = this.db.prepare(query)
    const rows = stmt.all(...params)
    const layers = rows.map((row) => this.rowToLayer(row))

    return {
      layers,
      totalCount: layers.length,
      hasMore: false,
      searchTime: Date.now() - startTime
    }
  }

  // Operations and error logging
  logOperation(operation: LayerOperation): void {
    this.statements.logOperation.run(
      operation.layerId,
      operation.type,
      operation.changes ? JSON.stringify(operation.changes) : null,
      null // userId - implement when user system is available
    )
  }

  getOperations(layerId?: string): LayerOperation[] {
    const rows = this.statements.getOperations.all(layerId || null, layerId || null)
    return rows.map((row) => this.rowToOperation(row))
  }

  logError(error: LayerError): void {
    this.statements.logError.run(
      error.layerId || null,
      error.code,
      error.message,
      error.details ? JSON.stringify(error.details) : null
    )
  }

  getErrors(layerId?: string): LayerError[] {
    const rows = this.statements.getErrors.all(layerId || null, layerId || null)
    return rows.map((row) => this.rowToError(row))
  }

  clearErrors(layerId?: string): void {
    this.statements.clearErrors.run(layerId || null, layerId || null)
  }

  // Style presets
  getAllStylePresets(): StylePreset[] {
    const rows = this.statements.getAllPresets.all()
    return rows.map((row) => this.rowToStylePreset(row))
  }

  getStylePresetById(id: string): StylePreset | undefined {
    const row = this.statements.getPresetById.get(id)
    return row ? this.rowToStylePreset(row) : undefined
  }

  createStylePreset(preset: Omit<StylePreset, 'id' | 'createdAt' | 'updatedAt'>): StylePreset {
    const id = this.generateId()
    const now = new Date()

    this.statements.createPreset.run(
      id,
      preset.name,
      preset.description || null,
      preset.layerType,
      preset.geometryType || null,
      JSON.stringify(preset.style),
      preset.preview || null,
      preset.isBuiltIn ? 1 : 0,
      JSON.stringify(preset.tags)
    )

    return {
      ...preset,
      id,
      createdAt: now
    }
  }

  deleteStylePreset(id: string): boolean {
    const result = this.statements.deletePreset.run(id)
    return result.changes > 0
  }

  // Performance metrics
  recordPerformanceMetrics(metrics: LayerPerformanceMetrics): void {
    this.statements.recordMetrics.run(
      metrics.layerId,
      metrics.loadTime,
      metrics.renderTime,
      metrics.memoryUsage || null,
      metrics.featureCount || null
    )
  }

  getPerformanceMetrics(layerId?: string): LayerPerformanceMetrics[] {
    const rows = this.statements.getMetrics.all(layerId || null, layerId || null)
    return rows.map((row) => this.rowToMetrics(row))
  }

  // Bulk operations
  bulkUpdateLayers(updates: Array<{ id: string; changes: Partial<LayerDefinition> }>): void {
    const tx = this.db.transaction(() => {
      for (const { id, changes } of updates) {
        this.updateLayer(id, changes)
      }
    })

    tx()
  }

  exportLayers(layerIds: string[]): string {
    const layers = layerIds.map((id) => this.getLayerById(id)).filter(Boolean) as LayerDefinition[]
    const groups = [...new Set(layers.map((l) => l.groupId).filter(Boolean))]
      .map((id) => this.getGroupById(id!))
      .filter(Boolean) as LayerGroup[]

    return JSON.stringify(
      {
        version: '1.0',
        timestamp: new Date().toISOString(),
        layers,
        groups
      },
      null,
      2
    )
  }

  importLayers(data: string, targetGroupId?: string): string[] {
    const importData = JSON.parse(data)
    const importedIds: string[] = []

    const tx = this.db.transaction(() => {
      // Import groups first
      if (importData.groups) {
        for (const groupData of importData.groups) {
          const group = { ...groupData }
          delete group.id
          delete group.createdAt
          delete group.updatedAt
          delete group.layerIds
          this.createGroup(group)
        }
      }

      // Import layers
      if (importData.layers) {
        for (const layerData of importData.layers) {
          const layer = { ...layerData }
          delete layer.id
          delete layer.createdAt
          delete layer.updatedAt
          const newLayer = this.createLayer({
            ...layer,
            groupId: targetGroupId || layer.groupId
          })
          importedIds.push(newLayer.id)
        }
      }
    })

    tx()
    return importedIds
  }

  // Helper methods
  private generateId(): string {
    return `layer-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
  }

  private rowToLayer(row: any): LayerDefinition {
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      sourceId: row.source_id,
      sourceConfig: JSON.parse(row.source_config),
      style: JSON.parse(row.style_config),
      visibility: Boolean(row.visibility),
      opacity: row.opacity,
      zIndex: row.z_index,
      metadata: JSON.parse(row.metadata || '{}'),
      groupId: row.group_id,
      isLocked: Boolean(row.is_locked),
      createdBy: row.created_by,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    }
  }

  private rowToGroup(row: any): LayerGroup {
    // Get layer IDs for this group
    const layerIds = this.getLayersByGroup(row.id).map((l) => l.id)

    return {
      id: row.id,
      name: row.name,
      parentId: row.parent_id,
      displayOrder: row.display_order,
      expanded: Boolean(row.expanded),
      layerIds,
      color: row.color,
      description: row.description,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    }
  }

  private rowToOperation(row: any): LayerOperation {
    return {
      type: row.operation_type,
      layerId: row.layer_id,
      changes: row.changes ? JSON.parse(row.changes) : undefined,
      timestamp: new Date(row.timestamp),
      userId: row.user_id
    }
  }

  private rowToError(row: any): LayerError {
    return {
      code: row.error_code,
      message: row.error_message,
      details: row.error_details ? JSON.parse(row.error_details) : undefined,
      layerId: row.layer_id,
      timestamp: new Date(row.timestamp)
    }
  }

  private rowToStylePreset(row: any): StylePreset {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      layerType: row.layer_type,
      geometryType: row.geometry_type,
      style: JSON.parse(row.style_config),
      preview: row.preview,
      isBuiltIn: Boolean(row.is_built_in),
      tags: JSON.parse(row.tags || '[]'),
      createdAt: new Date(row.created_at)
    }
  }

  private rowToMetrics(row: any): LayerPerformanceMetrics {
    return {
      layerId: row.layer_id,
      loadTime: row.load_time,
      renderTime: row.render_time,
      memoryUsage: row.memory_usage,
      featureCount: row.feature_count,
      timestamp: new Date(row.timestamp)
    }
  }

  close(): void {
    this.db.close()
  }
}

// Global service instance
let dbService: LayerDatabaseService | null = null

export function getLayerDbService(): LayerDatabaseService {
  if (!dbService) {
    const dbPath = join(app.getPath('userData'), 'layers.db')
    dbService = new LayerDatabaseService(dbPath)
  }
  return dbService
}

export function cleanupLayerDbService(): void {
  if (dbService) {
    dbService.close()
    dbService = null
  }
}
