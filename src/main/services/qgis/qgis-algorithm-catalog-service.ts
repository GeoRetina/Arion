import { createHash } from 'crypto'
import path from 'path'
import { app } from 'electron'
import type { QgisDiscoveredInstallation, QgisIntegrationConfig } from '../../../shared/ipc-types'
import {
  QgisAlgorithmCatalogStore,
  type StoredQgisAlgorithmCatalog,
  type StoredQgisAlgorithmCatalogEntry
} from './qgis-algorithm-catalog-store'
import { normalizeQgisAlgorithmList } from './qgis-algorithm-list'
import { runQgisLauncherCommand } from './qgis-command-runner'
import { QgisDiscoveryService } from './qgis-discovery-service'

const CATALOG_SCHEMA_VERSION = 2
const CATALOG_DIRECTORY_NAME = 'qgis-algorithm-catalogs'
const CATALOG_DATABASE_FILENAME = 'qgis-algorithm-catalogs.sqlite'
const MAX_ENRICH_PER_QUERY = 10
const MAX_CONCURRENT_HELP_REQUESTS = 3
const DEFAULT_HELP_TIMEOUT_MS = 8_000
const MAX_HELP_PREVIEW_LENGTH = 2_000
const OUTPUT_KEY_PATTERN = /(output|destination|dest|sink|file)$/i

interface QgisAlgorithmListEntry {
  id: string
  name?: string
  provider?: string
  supportedForExecution: boolean
}

interface QgisAlgorithmParameterRecord {
  name: string
  type?: string
  description?: string
  required?: boolean
  isOutput?: boolean
}

export interface QgisAlgorithmCatalogEntry extends QgisAlgorithmListEntry {
  summary?: string
  parameterNames: string[]
  parameterTypes: string[]
  parameterDescriptions: string[]
  requiredParameterNames: string[]
  outputParameterNames: string[]
  helpFetchedAt?: string
  rawHelpPreview?: string
}

interface QgisAlgorithmCatalogFile {
  schemaVersion: number
  cacheKey: string
  launcherPath: string
  version?: string
  allowPluginAlgorithms: boolean
  builtAt: string
  updatedAt: string
  entries: QgisAlgorithmCatalogEntry[]
}

interface QgisAlgorithmCatalogContext {
  cacheKey: string
  databasePath: string
  installation: QgisDiscoveredInstallation
  allowPluginAlgorithms: boolean
}

interface RankAlgorithmsRequest {
  algorithms: QgisAlgorithmListEntry[]
  query?: string
  provider?: string
  limit?: number
  timeoutMs?: number
  launcherPath?: string
  version?: string
  allowPluginAlgorithms?: boolean
}

export type RankAlgorithmsResult = {
  algorithms: Array<
    QgisAlgorithmListEntry & {
      summary?: string
      parameterNames?: string[]
      requiredParameterNames?: string[]
      outputParameterNames?: string[]
      relevance?: number
    }
  >
  totalAlgorithms: number
  matchedAlgorithms: number
  returnedAlgorithms: number
  truncated: boolean
  filters?: {
    query?: string
    provider?: string
    limit?: number
  }
  catalog?: {
    cacheKey: string
    builtAt: string
    updatedAt: string
    totalEntries: number
    enrichedEntries: number
  }
}

interface QgisAlgorithmCatalogServiceDeps {
  discoveryService?: QgisDiscoveryService
  getUserDataPath?: () => string
}

export class QgisAlgorithmCatalogService {
  private readonly discoveryService: QgisDiscoveryService
  private readonly getUserDataPath: () => string
  private readonly baseCatalogTasks = new Map<string, Promise<QgisAlgorithmCatalogFile | null>>()
  private readonly enrichmentTasks = new Map<string, Promise<void>>()

  constructor(deps: QgisAlgorithmCatalogServiceDeps = {}) {
    this.discoveryService = deps.discoveryService ?? new QgisDiscoveryService()
    this.getUserDataPath = deps.getUserDataPath ?? (() => app.getPath('userData'))
  }

  public async warmCatalog(config?: QgisIntegrationConfig | null): Promise<void> {
    const context = await this.resolveContextFromConfig(config)
    if (!context) {
      return
    }

    await this.ensureBaseCatalog(context)
  }

  public async rankAlgorithms(input: RankAlgorithmsRequest): Promise<RankAlgorithmsResult | null> {
    const context = await this.resolveContext(input)
    if (!context) {
      return null
    }

    let catalog = await this.ensureBaseCatalog(context, input.algorithms)
    if (!catalog) {
      return null
    }

    catalog = await this.mergeSeedAlgorithms(context, catalog, input.algorithms)

    const provider = normalizeOptionalText(input.provider)?.toLowerCase()
    const query = normalizeOptionalText(input.query)
    const limit = clampLimit(input.limit)
    const filters = buildFilters(query, provider, limit)
    const preliminaryRecords = catalog.entries.filter((entry) =>
      provider ? (entry.provider || entry.id.split(':')[0] || '').toLowerCase() === provider : true
    )

    if (query) {
      const candidatesToEnrich = this.getCatalogStore(context.databasePath)
        .searchCatalogEntries(context.cacheKey, query, {
          provider,
          limit: MAX_ENRICH_PER_QUERY * 4
        })
        .map(({ entry }) => entry)
        .filter((entry) => !entry.helpFetchedAt)
        .slice(0, MAX_ENRICH_PER_QUERY)
        .map((entry) => entry.id)

      if (candidatesToEnrich.length > 0) {
        await this.enrichCatalogEntries(context, candidatesToEnrich, input.timeoutMs)
        catalog = (await this.readCatalog(context)) ?? catalog
      }
    }

    const rankedRecords = query
      ? this.getCatalogStore(context.databasePath)
          .searchCatalogEntries(context.cacheKey, query, {
            provider,
            limit: Math.max(preliminaryRecords.length, limit)
          })
          .map(({ entry, relevance }) => ({
            entry: entry as QgisAlgorithmCatalogEntry,
            score: relevance
          }))
      : preliminaryRecords.map((entry) => ({
          entry,
          score: 0
        }))

    const limitedRecords = rankedRecords.slice(0, limit)
    const resultAlgorithms = limitedRecords.map(({ entry, score }) => ({
      id: entry.id,
      name: entry.name,
      provider: entry.provider,
      supportedForExecution: entry.supportedForExecution,
      summary: entry.summary,
      parameterNames: entry.parameterNames,
      requiredParameterNames: entry.requiredParameterNames,
      outputParameterNames: entry.outputParameterNames,
      ...(query ? { relevance: score } : {})
    }))

    const enrichedEntries = catalog.entries.filter(
      (entry) => typeof entry.helpFetchedAt === 'string'
    )

    return {
      algorithms: resultAlgorithms,
      totalAlgorithms: preliminaryRecords.length,
      matchedAlgorithms: rankedRecords.length,
      returnedAlgorithms: resultAlgorithms.length,
      truncated: resultAlgorithms.length < rankedRecords.length,
      ...(Object.keys(filters).length > 0 ? { filters } : {}),
      catalog: {
        cacheKey: catalog.cacheKey,
        builtAt: catalog.builtAt,
        updatedAt: catalog.updatedAt,
        totalEntries: catalog.entries.length,
        enrichedEntries: enrichedEntries.length
      }
    }
  }

  private async ensureBaseCatalog(
    context: QgisAlgorithmCatalogContext,
    seedAlgorithms?: QgisAlgorithmListEntry[]
  ): Promise<QgisAlgorithmCatalogFile | null> {
    const existingCatalog = await this.readCatalog(context)
    if (existingCatalog && existingCatalog.entries.length > 0) {
      return seedAlgorithms
        ? await this.mergeSeedAlgorithms(context, existingCatalog, seedAlgorithms)
        : existingCatalog
    }

    const existingTask = this.baseCatalogTasks.get(context.cacheKey)
    if (existingTask) {
      return existingTask
    }

    const task = (async () => {
      const catalog =
        seedAlgorithms && seedAlgorithms.length > 0
          ? createCatalogFile(context, seedAlgorithms)
          : await this.buildBaseCatalog(context)

      if (!catalog) {
        return null
      }

      await this.writeCatalog(context, catalog)
      return catalog
    })().finally(() => {
      this.baseCatalogTasks.delete(context.cacheKey)
    })

    this.baseCatalogTasks.set(context.cacheKey, task)
    return task
  }

  private async mergeSeedAlgorithms(
    context: QgisAlgorithmCatalogContext,
    catalog: QgisAlgorithmCatalogFile,
    seedAlgorithms: QgisAlgorithmListEntry[]
  ): Promise<QgisAlgorithmCatalogFile> {
    if (seedAlgorithms.length === 0) {
      return catalog
    }

    const entryById = new Map(catalog.entries.map((entry) => [entry.id, entry]))
    let hasChanges = false

    for (const algorithm of seedAlgorithms) {
      const existingEntry = entryById.get(algorithm.id)
      if (!existingEntry) {
        entryById.set(algorithm.id, createCatalogEntry(algorithm))
        hasChanges = true
        continue
      }

      if (
        existingEntry.name !== algorithm.name ||
        existingEntry.provider !== algorithm.provider ||
        existingEntry.supportedForExecution !== algorithm.supportedForExecution
      ) {
        existingEntry.name = algorithm.name
        existingEntry.provider = algorithm.provider
        existingEntry.supportedForExecution = algorithm.supportedForExecution
        hasChanges = true
      }
    }

    if (!hasChanges) {
      return catalog
    }

    const nextCatalog: QgisAlgorithmCatalogFile = {
      ...catalog,
      updatedAt: new Date().toISOString(),
      entries: Array.from(entryById.values()).sort(compareCatalogEntries)
    }
    await this.writeCatalog(context, nextCatalog)
    return nextCatalog
  }

  private async buildBaseCatalog(
    context: QgisAlgorithmCatalogContext
  ): Promise<QgisAlgorithmCatalogFile | null> {
    const result = await runQgisLauncherCommand({
      launcherPath: context.installation.launcherPath,
      args: ['--json', ...buildPluginFlags(context.allowPluginAlgorithms), 'list'],
      timeoutMs: 20_000,
      env: {
        ...process.env,
        QT_QPA_PLATFORM: process.env['QT_QPA_PLATFORM'] || 'offscreen'
      }
    }).catch(() => null)

    if (!result || result.exitCode !== 0) {
      return null
    }

    const parsedResult = safeParseJson(result.stdout)
    const algorithms = normalizeQgisAlgorithmList(parsedResult, result.stdout, {
      allowPluginAlgorithms: context.allowPluginAlgorithms
    }).algorithms
    return createCatalogFile(context, algorithms)
  }

  private async enrichCatalogEntries(
    context: QgisAlgorithmCatalogContext,
    algorithmIds: string[],
    timeoutMs?: number
  ): Promise<void> {
    const uniqueAlgorithmIds = Array.from(new Set(algorithmIds)).filter(
      (value) => value.trim().length > 0
    )
    if (uniqueAlgorithmIds.length === 0) {
      return
    }

    const existingTask = this.enrichmentTasks.get(context.cacheKey)
    if (existingTask) {
      await existingTask
      return
    }

    const task = (async () => {
      const catalog = await this.readCatalog(context)
      if (!catalog) {
        return
      }

      const entryById = new Map(catalog.entries.map((entry) => [entry.id, entry]))
      const effectiveTimeoutMs = Math.max(
        1_000,
        Math.min(timeoutMs ?? DEFAULT_HELP_TIMEOUT_MS, 15_000)
      )

      await mapWithConcurrency(
        uniqueAlgorithmIds,
        MAX_CONCURRENT_HELP_REQUESTS,
        async (algorithmId) => {
          const entry = entryById.get(algorithmId)
          if (!entry || entry.helpFetchedAt) {
            return
          }

          const result = await runQgisLauncherCommand({
            launcherPath: context.installation.launcherPath,
            args: [
              '--json',
              ...buildPluginFlags(context.allowPluginAlgorithms),
              'help',
              algorithmId
            ],
            timeoutMs: effectiveTimeoutMs,
            env: {
              ...process.env,
              QT_QPA_PLATFORM: process.env['QT_QPA_PLATFORM'] || 'offscreen'
            }
          }).catch(() => null)

          if (!result || result.exitCode !== 0) {
            return
          }

          applyHelpMetadata(entry, safeParseJson(result.stdout), result.stdout)
        }
      )

      const nextCatalog: QgisAlgorithmCatalogFile = {
        ...catalog,
        updatedAt: new Date().toISOString(),
        entries: Array.from(entryById.values()).sort(compareCatalogEntries)
      }
      await this.writeCatalog(context, nextCatalog)
    })().finally(() => {
      this.enrichmentTasks.delete(context.cacheKey)
    })

    this.enrichmentTasks.set(context.cacheKey, task)
    await task
  }

  private async resolveContext(input: {
    launcherPath?: string
    version?: string
    allowPluginAlgorithms?: boolean
  }): Promise<QgisAlgorithmCatalogContext | null> {
    if (typeof input.launcherPath === 'string' && input.launcherPath.trim().length > 0) {
      const installation: QgisDiscoveredInstallation = {
        launcherPath: input.launcherPath.trim(),
        version: normalizeOptionalText(input.version),
        platform: process.platform,
        source: 'manual',
        diagnostics: []
      }
      return this.createContext(installation, input.allowPluginAlgorithms === true)
    }

    return await this.resolveContextFromConfig(
      input.allowPluginAlgorithms === undefined
        ? undefined
        : {
            detectionMode: 'auto',
            allowPluginAlgorithms: input.allowPluginAlgorithms
          }
    )
  }

  private async resolveContextFromConfig(
    config?: QgisIntegrationConfig | null
  ): Promise<QgisAlgorithmCatalogContext | null> {
    const discovery = await this.discoveryService.discover(config)
    if (!discovery.preferredInstallation) {
      return null
    }

    return this.createContext(
      discovery.preferredInstallation,
      config?.allowPluginAlgorithms === true
    )
  }

  private createContext(
    installation: QgisDiscoveredInstallation,
    allowPluginAlgorithms: boolean
  ): QgisAlgorithmCatalogContext {
    const cacheKey = createCatalogCacheKey({
      launcherPath: installation.launcherPath,
      version: installation.version,
      allowPluginAlgorithms
    })

    return {
      cacheKey,
      databasePath: path.join(
        this.getUserDataPath(),
        CATALOG_DIRECTORY_NAME,
        CATALOG_DATABASE_FILENAME
      ),
      installation,
      allowPluginAlgorithms
    }
  }

  private async readCatalog(
    context: QgisAlgorithmCatalogContext
  ): Promise<QgisAlgorithmCatalogFile | null> {
    const storedCatalog = this.getCatalogStore(context.databasePath).readCatalog(context.cacheKey)
    if (!storedCatalog) {
      return null
    }

    return mapStoredCatalogToCatalogFile(storedCatalog)
  }

  private async writeCatalog(
    context: QgisAlgorithmCatalogContext,
    catalog: QgisAlgorithmCatalogFile
  ): Promise<void> {
    this.getCatalogStore(context.databasePath).writeCatalog(mapCatalogFileToStoredCatalog(catalog))
  }

  private getCatalogStore(databasePath: string): QgisAlgorithmCatalogStore {
    return new QgisAlgorithmCatalogStore(databasePath)
  }
}

function createCatalogFile(
  context: QgisAlgorithmCatalogContext,
  algorithms: QgisAlgorithmListEntry[]
): QgisAlgorithmCatalogFile {
  const timestamp = new Date().toISOString()
  return {
    schemaVersion: CATALOG_SCHEMA_VERSION,
    cacheKey: context.cacheKey,
    launcherPath: context.installation.launcherPath,
    version: context.installation.version,
    allowPluginAlgorithms: context.allowPluginAlgorithms,
    builtAt: timestamp,
    updatedAt: timestamp,
    entries: algorithms
      .map((algorithm) => createCatalogEntry(algorithm))
      .sort(compareCatalogEntries)
  }
}

function mapStoredCatalogToCatalogFile(
  storedCatalog: StoredQgisAlgorithmCatalog
): QgisAlgorithmCatalogFile {
  return {
    schemaVersion: CATALOG_SCHEMA_VERSION,
    cacheKey: storedCatalog.cacheKey,
    launcherPath: storedCatalog.launcherPath,
    version: storedCatalog.version,
    allowPluginAlgorithms: storedCatalog.allowPluginAlgorithms,
    builtAt: storedCatalog.builtAt,
    updatedAt: storedCatalog.updatedAt,
    entries: storedCatalog.entries.map(mapStoredEntryToCatalogEntry)
  }
}

function mapStoredEntryToCatalogEntry(
  entry: StoredQgisAlgorithmCatalogEntry
): QgisAlgorithmCatalogEntry {
  return {
    id: entry.id,
    name: entry.name,
    provider: entry.provider,
    supportedForExecution: entry.supportedForExecution,
    summary: entry.summary,
    parameterNames: entry.parameterNames,
    parameterTypes: entry.parameterTypes,
    parameterDescriptions: entry.parameterDescriptions,
    requiredParameterNames: entry.requiredParameterNames,
    outputParameterNames: entry.outputParameterNames,
    helpFetchedAt: entry.helpFetchedAt,
    rawHelpPreview: entry.rawHelpPreview
  }
}

function mapCatalogFileToStoredCatalog(
  catalog: QgisAlgorithmCatalogFile
): StoredQgisAlgorithmCatalog {
  return {
    cacheKey: catalog.cacheKey,
    launcherPath: catalog.launcherPath,
    version: catalog.version,
    allowPluginAlgorithms: catalog.allowPluginAlgorithms,
    builtAt: catalog.builtAt,
    updatedAt: catalog.updatedAt,
    entries: catalog.entries.map((entry) => ({
      id: entry.id,
      name: entry.name,
      provider: entry.provider,
      supportedForExecution: entry.supportedForExecution,
      summary: entry.summary,
      parameterNames: entry.parameterNames,
      parameterTypes: entry.parameterTypes,
      parameterDescriptions: entry.parameterDescriptions,
      requiredParameterNames: entry.requiredParameterNames,
      outputParameterNames: entry.outputParameterNames,
      helpFetchedAt: entry.helpFetchedAt,
      rawHelpPreview: entry.rawHelpPreview
    }))
  }
}

function createCatalogEntry(algorithm: QgisAlgorithmListEntry): QgisAlgorithmCatalogEntry {
  return {
    id: algorithm.id,
    name: algorithm.name,
    provider: algorithm.provider,
    supportedForExecution: algorithm.supportedForExecution,
    parameterNames: [],
    parameterTypes: [],
    parameterDescriptions: [],
    requiredParameterNames: [],
    outputParameterNames: []
  }
}

function applyHelpMetadata(
  entry: QgisAlgorithmCatalogEntry,
  parsedHelp: unknown,
  rawStdout: string
): void {
  const parameterDefinitions = extractParameterDefinitions(parsedHelp)
  entry.summary = extractHelpSummary(parsedHelp, rawStdout, entry)
  entry.parameterNames = parameterDefinitions.map((definition) => definition.name)
  entry.parameterTypes = uniqueNormalizedValues(
    parameterDefinitions.map((definition) => definition.type)
  )
  entry.parameterDescriptions = uniqueNormalizedValues(
    parameterDefinitions.map((definition) => definition.description)
  )
  entry.requiredParameterNames = parameterDefinitions
    .filter((definition) => definition.required && !definition.isOutput)
    .map((definition) => definition.name)
  entry.outputParameterNames = parameterDefinitions
    .filter((definition) => definition.isOutput)
    .map((definition) => definition.name)
  entry.helpFetchedAt = new Date().toISOString()
  entry.rawHelpPreview = limitText(rawStdout)
}

function uniqueNormalizedValues(values: Array<string | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => normalizeOptionalText(value))
        .filter((value): value is string => typeof value === 'string')
    )
  ).sort()
}

function extractHelpSummary(
  parsedHelp: unknown,
  rawStdout: string,
  entry: Pick<QgisAlgorithmCatalogEntry, 'name' | 'id'>
): string | undefined {
  if (isRecord(parsedHelp)) {
    const explicitSummary = readString(
      parsedHelp['summary'],
      parsedHelp['description'],
      parsedHelp['short_description'],
      parsedHelp['shortDescription'],
      parsedHelp['help'],
      parsedHelp['shortHelpString']
    )
    if (explicitSummary) {
      return normalizeWhitespace(explicitSummary)
    }

    const flattenedStrings = collectMeaningfulStrings(parsedHelp)
      .filter((value) => value !== entry.name && value !== entry.id)
      .map(normalizeWhitespace)
      .filter((value) => value.length >= 20)

    if (flattenedStrings.length > 0) {
      return flattenedStrings[0]
    }
  }

  const textLines = rawStdout
    .split(/\r?\n/u)
    .map((line) => normalizeWhitespace(line))
    .filter((line) => line.length > 0 && line !== entry.name && line !== entry.id)

  return textLines.find((line) => line.length >= 20)
}

function extractParameterDefinitions(value: unknown): QgisAlgorithmParameterRecord[] {
  const byName = new Map<string, QgisAlgorithmParameterRecord>()

  const visit = (node: unknown, pathParts: string[] = []): void => {
    if (Array.isArray(node)) {
      for (const child of node) {
        visit(child, pathParts)
      }
      return
    }

    if (!isRecord(node)) {
      return
    }

    const sectionHint = inferSectionHint(pathParts)
    const fallbackName = pathParts[pathParts.length - 1]
    const maybeParameter = toParameterDefinition(node, fallbackName, sectionHint)
    if (maybeParameter && !byName.has(maybeParameter.name)) {
      byName.set(maybeParameter.name, maybeParameter)
    }

    for (const [key, child] of Object.entries(node)) {
      const nextPath = [...pathParts, key]
      if (isRecord(child)) {
        const candidate = toParameterDefinition(child, key, inferSectionHint(nextPath))
        if (candidate && !byName.has(candidate.name)) {
          byName.set(candidate.name, candidate)
        }
      }
      visit(child, nextPath)
    }
  }

  visit(value)
  return Array.from(byName.values())
}

function toParameterDefinition(
  value: Record<string, unknown>,
  fallbackName: string | undefined,
  sectionHint: 'input' | 'output' | undefined
): QgisAlgorithmParameterRecord | null {
  const explicitName = readString(
    value['name'],
    value['parameter'],
    value['parameter_name'],
    value['argument'],
    value['id'],
    value['key']
  )
  const candidateName =
    explicitName ||
    (looksLikeParameterName(fallbackName) && fallbackName
      ? normalizeParameterName(fallbackName)
      : undefined)

  if (!candidateName) {
    return null
  }

  const type = readString(
    value['type'],
    value['parameter_type'],
    value['parameterType'],
    value['class'],
    value['data_type'],
    value['dataType']
  )
  const description = readString(
    value['description'],
    value['help'],
    value['summary'],
    value['tooltip'],
    value['label']
  )
  const required =
    value['required'] === true || value['optional'] === false || value['isOptional'] === false
  const isOutput =
    sectionHint === 'output' ||
    value['isOutput'] === true ||
    value['is_output'] === true ||
    value['isDestination'] === true ||
    value['destination'] === true ||
    OUTPUT_KEY_PATTERN.test(candidateName) ||
    OUTPUT_KEY_PATTERN.test(type || '') ||
    OUTPUT_KEY_PATTERN.test(description || '')

  if (
    !type &&
    !description &&
    sectionHint === undefined &&
    !OUTPUT_KEY_PATTERN.test(candidateName)
  ) {
    return null
  }

  return {
    name: candidateName,
    type,
    description: description ? normalizeWhitespace(description) : undefined,
    required,
    isOutput
  }
}

function inferSectionHint(pathParts: string[]): 'input' | 'output' | undefined {
  const pathText = pathParts.join('.').toLowerCase()
  if (/(^|\.)(outputs?|destinations?|sinks?)($|\.)/.test(pathText)) {
    return 'output'
  }
  if (/(^|\.)(inputs?|parameters?)($|\.)/.test(pathText)) {
    return 'input'
  }
  return undefined
}

function buildPluginFlags(allowPluginAlgorithms: boolean): string[] {
  return allowPluginAlgorithms ? [] : ['--skip-loading-plugins']
}

function compareCatalogEntries(
  left: QgisAlgorithmCatalogEntry,
  right: QgisAlgorithmCatalogEntry
): number {
  if (left.supportedForExecution !== right.supportedForExecution) {
    return left.supportedForExecution ? -1 : 1
  }

  const leftName = left.name || left.id
  const rightName = right.name || right.id
  return leftName.localeCompare(rightName)
}

function createCatalogCacheKey(input: {
  launcherPath: string
  version?: string
  allowPluginAlgorithms: boolean
}): string {
  return createHash('sha1')
    .update(
      JSON.stringify({
        schemaVersion: CATALOG_SCHEMA_VERSION,
        launcherPath: input.launcherPath,
        version: input.version || '',
        allowPluginAlgorithms: input.allowPluginAlgorithms
      })
    )
    .digest('hex')
}

function clampLimit(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 25
  }

  return Math.max(1, Math.min(Math.floor(value), 200))
}

function buildFilters(query?: string, provider?: string, limit?: number): Record<string, unknown> {
  const filters: Record<string, unknown> = {}
  if (query) {
    filters.query = query
  }
  if (provider) {
    filters.provider = provider
  }
  if (typeof limit === 'number') {
    filters.limit = limit
  }
  return filters
}

function looksLikeParameterName(value: string | undefined): boolean {
  if (!value || value.trim().length === 0) {
    return false
  }

  const trimmedValue = value.trim()
  return (
    /^[A-Za-z][A-Za-z0-9_]+$/.test(trimmedValue) &&
    (trimmedValue === trimmedValue.toUpperCase() ||
      /input|output|field|expression|layer|distance|geometry/i.test(trimmedValue))
  )
}

function normalizeParameterName(value: string): string {
  return value.trim().replace(/\s+/g, '_')
}

function collectMeaningfulStrings(value: unknown, limit = 20): string[] {
  const strings: string[] = []

  const visit = (node: unknown): void => {
    if (strings.length >= limit) {
      return
    }
    if (typeof node === 'string') {
      const normalized = normalizeWhitespace(node)
      if (normalized.length > 0) {
        strings.push(normalized)
      }
      return
    }
    if (Array.isArray(node)) {
      for (const child of node) {
        visit(child)
      }
      return
    }
    if (!isRecord(node)) {
      return
    }
    for (const child of Object.values(node)) {
      visit(child)
    }
  }

  visit(value)
  return strings
}

async function mapWithConcurrency<T>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<void>
): Promise<void> {
  let index = 0

  const workers = Array.from(
    { length: Math.max(1, Math.min(concurrency, values.length)) },
    async () => {
      while (index < values.length) {
        const currentIndex = index
        index += 1
        await mapper(values[currentIndex])
      }
    }
  )

  await Promise.all(workers)
}

function safeParseJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}

function normalizeOptionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function readString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim()
    }
  }
  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function limitText(value: string): string | undefined {
  const normalized = value.trim()
  if (normalized.length === 0) {
    return undefined
  }

  return normalized.length > MAX_HELP_PREVIEW_LENGTH
    ? `${normalized.slice(0, MAX_HELP_PREVIEW_LENGTH)}...`
    : normalized
}
