import fs from 'fs'
import path from 'path'
import { resolveMigrationPath } from '../../lib/migration-paths'
import { buildQgisSearchMatchExpression } from './qgis-search-text'
import { createQgisSqliteDatabase } from './qgis-sqlite'

export interface StoredQgisAlgorithmCatalogEntry {
  id: string
  name?: string
  provider?: string
  supportedForExecution: boolean
  summary?: string
  parameterNames: string[]
  parameterTypes: string[]
  parameterDescriptions: string[]
  requiredParameterNames: string[]
  outputParameterNames: string[]
  helpFetchedAt?: string
  rawHelpPreview?: string
}

export interface StoredQgisAlgorithmCatalog {
  cacheKey: string
  launcherPath: string
  version?: string
  allowPluginAlgorithms: boolean
  builtAt: string
  updatedAt: string
  entries: StoredQgisAlgorithmCatalogEntry[]
}

export interface StoredQgisAlgorithmCatalogSearchResult {
  entry: StoredQgisAlgorithmCatalogEntry
  relevance: number
}

interface CatalogRow {
  cache_key: string
  launcher_path: string
  version: string | null
  allow_plugin_algorithms: number
  built_at: string
  updated_at: string
}

interface EntryRow {
  id: string
  name: string | null
  provider: string | null
  supported_for_execution: number
  summary: string | null
  parameter_names: string
  parameter_types: string
  parameter_descriptions: string
  required_parameter_names: string
  output_parameter_names: string
  help_fetched_at: string | null
  raw_help_preview: string | null
}

interface SearchEntryRow extends EntryRow {
  rank: number | null
}

const MIGRATION_FILES = ['add-qgis-algorithm-catalog-cache.sql']

export class QgisAlgorithmCatalogStore {
  constructor(private readonly databasePath: string) {}

  public readCatalog(cacheKey: string): StoredQgisAlgorithmCatalog | null {
    return this.withDatabase((db) => {
      const row = db
        .prepare(
          `SELECT cache_key, launcher_path, version, allow_plugin_algorithms, built_at, updated_at
           FROM qgis_algorithm_catalogs
           WHERE cache_key = ?`
        )
        .get(cacheKey)

      if (!isCatalogRow(row)) {
        return null
      }

      const entryRows = db
        .prepare(
          `SELECT
             id,
             name,
             provider,
             supported_for_execution,
             summary,
             parameter_names,
             parameter_types,
             parameter_descriptions,
             required_parameter_names,
             output_parameter_names,
             help_fetched_at,
             raw_help_preview
           FROM qgis_algorithm_entries
           WHERE cache_key = ?
           ORDER BY supported_for_execution DESC, sort_name, id`
        )
        .all(cacheKey)

      return {
        cacheKey: row.cache_key,
        launcherPath: row.launcher_path,
        version: normalizeOptionalText(row.version),
        allowPluginAlgorithms: row.allow_plugin_algorithms === 1,
        builtAt: row.built_at,
        updatedAt: row.updated_at,
        entries: Array.isArray(entryRows)
          ? entryRows.filter(isEntryRow).map(mapEntryRowToCatalogEntry)
          : []
      }
    })
  }

  public writeCatalog(catalog: StoredQgisAlgorithmCatalog): void {
    this.withDatabase((db) => {
      db.exec('BEGIN IMMEDIATE')
      try {
        db.prepare(
          `INSERT INTO qgis_algorithm_catalogs (
             cache_key,
             launcher_path,
             version,
             allow_plugin_algorithms,
             built_at,
             updated_at
           ) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(cache_key) DO UPDATE SET
             launcher_path = excluded.launcher_path,
             version = excluded.version,
             allow_plugin_algorithms = excluded.allow_plugin_algorithms,
             built_at = excluded.built_at,
             updated_at = excluded.updated_at`
        ).run(
          catalog.cacheKey,
          catalog.launcherPath,
          catalog.version || null,
          catalog.allowPluginAlgorithms ? 1 : 0,
          catalog.builtAt,
          catalog.updatedAt
        )

        db.prepare('DELETE FROM qgis_algorithm_entries WHERE cache_key = ?').run(catalog.cacheKey)

        const insertEntry = db.prepare(
          `INSERT INTO qgis_algorithm_entries (
             cache_key,
             id,
             name,
             provider,
             supported_for_execution,
             summary,
             parameter_names,
             parameter_types,
             parameter_descriptions,
             required_parameter_names,
             output_parameter_names,
             help_fetched_at,
             raw_help_preview,
             sort_name
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )

        for (const entry of catalog.entries) {
          insertEntry.run(
            catalog.cacheKey,
            entry.id,
            entry.name || null,
            entry.provider || null,
            entry.supportedForExecution ? 1 : 0,
            entry.summary || null,
            JSON.stringify(entry.parameterNames),
            JSON.stringify(entry.parameterTypes),
            JSON.stringify(entry.parameterDescriptions),
            JSON.stringify(entry.requiredParameterNames),
            JSON.stringify(entry.outputParameterNames),
            entry.helpFetchedAt || null,
            entry.rawHelpPreview || null,
            buildSortName(entry)
          )
        }

        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    })
  }

  public searchCatalogEntries(
    cacheKey: string,
    query: string,
    options: {
      provider?: string
      limit?: number
    } = {}
  ): StoredQgisAlgorithmCatalogSearchResult[] {
    const matchExpression = buildQgisSearchMatchExpression(query)
    if (!matchExpression) {
      return []
    }

    return this.withDatabase((db) => {
      const normalizedProvider = normalizeOptionalText(options.provider)?.toLowerCase()
      const limit = clampLimit(options.limit)
      const params = [matchExpression, cacheKey] as unknown[]
      const providerClause = normalizedProvider
        ? `AND lower(coalesce(e.provider, substr(e.id, 1, instr(e.id, ':') - 1))) = ?`
        : ''
      if (normalizedProvider) {
        params.push(normalizedProvider)
      }
      params.push(limit)

      const rows = db
        .prepare(
          `SELECT
             e.id,
             e.name,
             e.provider,
             e.supported_for_execution,
             e.summary,
             e.parameter_names,
             e.parameter_types,
             e.parameter_descriptions,
             e.required_parameter_names,
             e.output_parameter_names,
             e.help_fetched_at,
             e.raw_help_preview,
             bm25(qgis_algorithm_entries_fts) AS rank
           FROM qgis_algorithm_entries_fts
           INNER JOIN qgis_algorithm_entries e ON e.rowid = qgis_algorithm_entries_fts.rowid
           WHERE qgis_algorithm_entries_fts MATCH ?
             AND e.cache_key = ?
             ${providerClause}
           ORDER BY rank, CASE e.supported_for_execution WHEN 1 THEN 0 ELSE 1 END, e.sort_name, e.id
           LIMIT ?`
        )
        .all(...params)

      if (!Array.isArray(rows)) {
        return []
      }

      return rows
        .filter(isSearchEntryRow)
        .map((row) => ({
          entry: mapEntryRowToCatalogEntry(row),
          relevance: normalizeRelevance(row.rank)
        }))
        .filter((result) => result.relevance > 0)
    })
  }

  private withDatabase<T>(callback: (db: ReturnType<typeof createQgisSqliteDatabase>) => T): T {
    fs.mkdirSync(path.dirname(this.databasePath), { recursive: true })
    const db = createQgisSqliteDatabase(this.databasePath)

    try {
      db.exec('PRAGMA foreign_keys = ON')
      for (const migrationFile of MIGRATION_FILES) {
        const migrationPath = resolveMigrationPath(migrationFile, {
          currentDir: __dirname,
          cwd: process.cwd(),
          resourcesPath: process.resourcesPath
        })
        db.exec(fs.readFileSync(migrationPath, 'utf8'))
      }

      return callback(db)
    } finally {
      db.close()
    }
  }
}

function mapEntryRowToCatalogEntry(row: EntryRow): StoredQgisAlgorithmCatalogEntry {
  return {
    id: row.id,
    name: normalizeOptionalText(row.name),
    provider: normalizeOptionalText(row.provider),
    supportedForExecution: row.supported_for_execution === 1,
    summary: normalizeOptionalText(row.summary),
    parameterNames: parseStringArray(row.parameter_names),
    parameterTypes: parseStringArray(row.parameter_types),
    parameterDescriptions: parseStringArray(row.parameter_descriptions),
    requiredParameterNames: parseStringArray(row.required_parameter_names),
    outputParameterNames: parseStringArray(row.output_parameter_names),
    helpFetchedAt: normalizeOptionalText(row.help_fetched_at),
    rawHelpPreview: normalizeOptionalText(row.raw_help_preview)
  }
}

function parseStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.filter((entry): entry is string => typeof entry === 'string')
  } catch {
    return []
  }
}

function normalizeRelevance(rank: number | null): number {
  if (typeof rank !== 'number' || !Number.isFinite(rank)) {
    return 0
  }

  return -rank
}

function buildSortName(entry: Pick<StoredQgisAlgorithmCatalogEntry, 'id' | 'name'>): string {
  return normalizeSearchText(entry.name || entry.id)
}

function normalizeSearchText(value: string | undefined): string {
  if (!value) {
    return ''
  }

  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

function normalizeOptionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function clampLimit(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 200
  }

  return Math.max(1, Math.min(Math.floor(value), 10_000))
}

function isCatalogRow(value: unknown): value is CatalogRow {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof (value as Record<string, unknown>)['cache_key'] === 'string' &&
    typeof (value as Record<string, unknown>)['launcher_path'] === 'string' &&
    typeof (value as Record<string, unknown>)['allow_plugin_algorithms'] === 'number' &&
    typeof (value as Record<string, unknown>)['built_at'] === 'string' &&
    typeof (value as Record<string, unknown>)['updated_at'] === 'string'
  )
}

function isEntryRow(value: unknown): value is EntryRow {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof (value as Record<string, unknown>)['id'] === 'string' &&
    typeof (value as Record<string, unknown>)['supported_for_execution'] === 'number' &&
    typeof (value as Record<string, unknown>)['parameter_names'] === 'string' &&
    typeof (value as Record<string, unknown>)['parameter_types'] === 'string' &&
    typeof (value as Record<string, unknown>)['parameter_descriptions'] === 'string' &&
    typeof (value as Record<string, unknown>)['required_parameter_names'] === 'string' &&
    typeof (value as Record<string, unknown>)['output_parameter_names'] === 'string'
  )
}

function isSearchEntryRow(value: unknown): value is SearchEntryRow {
  const recordValue = value as unknown as Record<string, unknown>
  return (
    isEntryRow(value) && (recordValue['rank'] === null || typeof recordValue['rank'] === 'number')
  )
}
