import { createHash } from 'crypto'
import { promises as fs } from 'fs'
import path from 'path'
import { app } from 'electron'
import type { QgisDiscoveredInstallation, QgisIntegrationConfig } from '../../../shared/ipc-types'
import { isQgisAlgorithmApproved } from './qgis-algorithm-policy'
import { runQgisLauncherCommand } from './qgis-command-runner'
import { QgisDiscoveryService } from './qgis-discovery-service'

const CATALOG_SCHEMA_VERSION = 1
const CATALOG_DIRECTORY_NAME = 'qgis-algorithm-catalogs'
const MAX_ENRICH_PER_QUERY = 10
const MAX_CONCURRENT_HELP_REQUESTS = 3
const DEFAULT_HELP_TIMEOUT_MS = 8_000
const MAX_HELP_PREVIEW_LENGTH = 2_000
const OUTPUT_KEY_PATTERN = /(output|destination|dest|sink|file)$/i
const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'how',
  'if',
  'in',
  'into',
  'is',
  'it',
  'of',
  'on',
  'or',
  'that',
  'the',
  'their',
  'then',
  'this',
  'to',
  'use',
  'using',
  'with'
])

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
  categoryHints?: string[]
  geometryHints?: string[]
  layerTypeHints?: string[]
  parameterNames: string[]
  requiredParameterNames: string[]
  outputParameterNames: string[]
  helpFetchedAt?: string
  rawHelpPreview?: string
  searchTerms: string[]
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
  cachePath: string
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
      categoryHints?: string[]
      geometryHints?: string[]
      layerTypeHints?: string[]
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
      const candidatesToEnrich = preliminaryRecords
        .map((entry) => ({
          entry,
          score: scoreAlgorithmEntry(entry, query)
        }))
        .sort(compareScoredEntries)
        .filter(({ entry }) => !entry.helpFetchedAt)
        .slice(0, MAX_ENRICH_PER_QUERY)
        .map(({ entry }) => entry.id)

      if (candidatesToEnrich.length > 0) {
        await this.enrichCatalogEntries(context, candidatesToEnrich, input.timeoutMs)
        catalog = (await this.readCatalog(context.cachePath)) ?? catalog
      }
    }

    const rankedRecords = catalog.entries
      .filter((entry) =>
        provider
          ? (entry.provider || entry.id.split(':')[0] || '').toLowerCase() === provider
          : true
      )
      .map((entry) => ({
        entry,
        score: query ? scoreAlgorithmEntry(entry, query) : 0
      }))
      .filter(({ score }) => !query || score > 0)
      .sort(compareScoredEntries)

    const limitedRecords = rankedRecords.slice(0, limit)
    const resultAlgorithms = limitedRecords.map(({ entry, score }) => ({
      id: entry.id,
      name: entry.name,
      provider: entry.provider,
      supportedForExecution: entry.supportedForExecution,
      summary: entry.summary,
      categoryHints: entry.categoryHints,
      geometryHints: entry.geometryHints,
      layerTypeHints: entry.layerTypeHints,
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
    const existingCatalog = await this.readCatalog(context.cachePath)
    if (existingCatalog) {
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

      await this.writeCatalog(context.cachePath, catalog)
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
        existingEntry.searchTerms = buildSearchTerms(existingEntry)
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
    await this.writeCatalog(context.cachePath, nextCatalog)
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
    const algorithms = normalizeAlgorithmList(
      parsedResult,
      result.stdout,
      context.allowPluginAlgorithms
    )
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
      const catalog = await this.readCatalog(context.cachePath)
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
      await this.writeCatalog(context.cachePath, nextCatalog)
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
      cachePath: path.join(this.getUserDataPath(), CATALOG_DIRECTORY_NAME, `${cacheKey}.json`),
      installation,
      allowPluginAlgorithms
    }
  }

  private async readCatalog(catalogPath: string): Promise<QgisAlgorithmCatalogFile | null> {
    try {
      const raw = await fs.readFile(catalogPath, 'utf8')
      const parsed = JSON.parse(raw) as QgisAlgorithmCatalogFile
      if (
        parsed.schemaVersion !== CATALOG_SCHEMA_VERSION ||
        !Array.isArray(parsed.entries) ||
        typeof parsed.cacheKey !== 'string'
      ) {
        return null
      }

      return {
        ...parsed,
        entries: parsed.entries
          .filter((entry): entry is QgisAlgorithmCatalogEntry => isCatalogEntry(entry))
          .map((entry) => ({
            ...entry,
            parameterNames: Array.isArray(entry.parameterNames) ? entry.parameterNames : [],
            requiredParameterNames: Array.isArray(entry.requiredParameterNames)
              ? entry.requiredParameterNames
              : [],
            outputParameterNames: Array.isArray(entry.outputParameterNames)
              ? entry.outputParameterNames
              : [],
            searchTerms: Array.isArray(entry.searchTerms)
              ? entry.searchTerms
              : buildSearchTerms(entry)
          }))
      }
    } catch {
      return null
    }
  }

  private async writeCatalog(
    catalogPath: string,
    catalog: QgisAlgorithmCatalogFile
  ): Promise<void> {
    await fs.mkdir(path.dirname(catalogPath), { recursive: true })
    await fs.writeFile(catalogPath, JSON.stringify(catalog, null, 2), 'utf8')
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

function createCatalogEntry(algorithm: QgisAlgorithmListEntry): QgisAlgorithmCatalogEntry {
  const entry: QgisAlgorithmCatalogEntry = {
    id: algorithm.id,
    name: algorithm.name,
    provider: algorithm.provider,
    supportedForExecution: algorithm.supportedForExecution,
    parameterNames: [],
    requiredParameterNames: [],
    outputParameterNames: [],
    searchTerms: []
  }
  entry.searchTerms = buildSearchTerms(entry)
  return entry
}

function applyHelpMetadata(
  entry: QgisAlgorithmCatalogEntry,
  parsedHelp: unknown,
  rawStdout: string
): void {
  const parameterDefinitions = extractParameterDefinitions(parsedHelp)
  const summary = extractHelpSummary(parsedHelp, rawStdout, entry)
  const categoryHints = inferCategoryHints(entry, summary, parameterDefinitions)
  const geometryHints = inferGeometryHints(summary, parameterDefinitions)
  const layerTypeHints = inferLayerTypeHints(entry, summary, parameterDefinitions)

  entry.summary = summary
  entry.parameterNames = parameterDefinitions.map((definition) => definition.name)
  entry.requiredParameterNames = parameterDefinitions
    .filter((definition) => definition.required && !definition.isOutput)
    .map((definition) => definition.name)
  entry.outputParameterNames = parameterDefinitions
    .filter((definition) => definition.isOutput)
    .map((definition) => definition.name)
  entry.categoryHints = categoryHints
  entry.geometryHints = geometryHints
  entry.layerTypeHints = layerTypeHints
  entry.helpFetchedAt = new Date().toISOString()
  entry.rawHelpPreview = limitText(rawStdout)
  entry.searchTerms = buildSearchTerms(entry)
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

function inferCategoryHints(
  entry: Pick<QgisAlgorithmCatalogEntry, 'id' | 'name' | 'provider'>,
  summary: string | undefined,
  parameterDefinitions: QgisAlgorithmParameterRecord[]
): string[] {
  const searchText = [entry.id, entry.name, entry.provider, summary]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join(' ')
    .toLowerCase()
  const parameterNames = parameterDefinitions.map((definition) => definition.name.toLowerCase())
  const hints = new Set<string>()

  if (
    /(sort|order|ascending|descending|rank)/.test(searchText) ||
    parameterNames.includes('ascending')
  ) {
    hints.add('sorting')
  }
  if (/(extract|select|filter|subset)/.test(searchText)) {
    hints.add('selection')
  }
  if (/(join|relate|lookup)/.test(searchText)) {
    hints.add('join')
  }
  if (/(clip|intersection|intersect|overlay|union)/.test(searchText)) {
    hints.add('overlay')
  }
  if (/(buffer|distance|nearest|proximity)/.test(searchText)) {
    hints.add('proximity')
  }
  if (/(field|attribute|column|table)/.test(searchText)) {
    hints.add('attributes')
  }
  if (/(geometry|vertices|line|polygon|point)/.test(searchText)) {
    hints.add('geometry')
  }
  if (/(raster|pixel|band|tif|tiff|grid)/.test(searchText)) {
    hints.add('raster')
  }
  if (/(layout|print|map export|atlas)/.test(searchText)) {
    hints.add('layout')
  }
  if (/(style|symbology|qml|sld)/.test(searchText)) {
    hints.add('style')
  }
  if (/(convert|translate|reproject|transform)/.test(searchText)) {
    hints.add('conversion')
  }

  return Array.from(hints.values()).sort()
}

function inferGeometryHints(
  summary: string | undefined,
  parameterDefinitions: QgisAlgorithmParameterRecord[]
): string[] {
  const searchText = [
    summary,
    ...parameterDefinitions.map((definition) => definition.description || ''),
    ...parameterDefinitions.map((definition) => definition.type || '')
  ]
    .join(' ')
    .toLowerCase()
  const hints = new Set<string>()

  if (/(point|multipoint)/.test(searchText)) {
    hints.add('Point')
  }
  if (/(line|string|multiline)/.test(searchText)) {
    hints.add('LineString')
  }
  if (/(polygon|multipolygon)/.test(searchText)) {
    hints.add('Polygon')
  }

  return Array.from(hints.values()).sort()
}

function inferLayerTypeHints(
  entry: Pick<QgisAlgorithmCatalogEntry, 'provider' | 'id'>,
  summary: string | undefined,
  parameterDefinitions: QgisAlgorithmParameterRecord[]
): string[] {
  const searchText = [
    entry.provider,
    entry.id,
    summary,
    ...parameterDefinitions.map((definition) => definition.type || ''),
    ...parameterDefinitions.map((definition) => definition.description || '')
  ]
    .join(' ')
    .toLowerCase()
  const hints = new Set<string>()

  if (/(vector|feature source|feature sink|geometry)/.test(searchText)) {
    hints.add('vector')
  }
  if (/(raster|band|pixel|grid)/.test(searchText)) {
    hints.add('raster')
  }
  if (/(table|attribute table|csv)/.test(searchText)) {
    hints.add('table')
  }
  if (/(layout|print layout)/.test(searchText)) {
    hints.add('layout')
  }

  return Array.from(hints.values()).sort()
}

function scoreAlgorithmEntry(entry: QgisAlgorithmCatalogEntry, query: string): number {
  const normalizedQuery = query.trim().toLowerCase()
  const queryTerms = tokenizeText(normalizedQuery)
  if (queryTerms.length === 0) {
    return 0
  }

  const name = (entry.name || '').toLowerCase()
  const id = entry.id.toLowerCase()
  const summary = (entry.summary || '').toLowerCase()
  const provider = (entry.provider || '').toLowerCase()
  const searchTerms = new Set(entry.searchTerms)

  let score = entry.supportedForExecution ? 8 : 0

  if (name.includes(normalizedQuery)) {
    score += 120
  }
  if (id.includes(normalizedQuery)) {
    score += 96
  }
  if (summary.includes(normalizedQuery)) {
    score += 72
  }

  for (const term of queryTerms) {
    if (name.includes(term)) {
      score += 40
    }
    if (id.includes(term)) {
      score += 32
    }
    if (summary.includes(term)) {
      score += 22
    }
    if (provider.includes(term)) {
      score += 10
    }
    if (searchTerms.has(term)) {
      score += 18
    }
  }

  if (
    entry.categoryHints?.includes('sorting') &&
    /(sort|order|rank|top|longest|shortest|largest|smallest)/.test(normalizedQuery)
  ) {
    score += 28
  }
  if (
    entry.categoryHints?.includes('selection') &&
    /(extract|select|filter|subset|keep)/.test(normalizedQuery)
  ) {
    score += 24
  }

  return score
}

function buildSearchTerms(entry: Partial<QgisAlgorithmCatalogEntry>): string[] {
  const values: string[] = [
    entry.id || '',
    entry.name || '',
    entry.provider || '',
    entry.summary || '',
    ...(entry.categoryHints || []),
    ...(entry.geometryHints || []),
    ...(entry.layerTypeHints || []),
    ...(entry.parameterNames || []),
    ...(entry.requiredParameterNames || []),
    ...(entry.outputParameterNames || [])
  ]

  return Array.from(new Set(values.flatMap((value) => tokenizeText(value)))).sort()
}

function tokenizeText(value: string): string[] {
  return normalizeWhitespace(value)
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !STOPWORDS.has(token))
}

function normalizeAlgorithmList(
  parsedResult: unknown,
  stdout: string,
  allowPluginAlgorithms: boolean
): QgisAlgorithmListEntry[] {
  const algorithms = new Map<string, QgisAlgorithmListEntry>()

  const pushAlgorithm = (entry: { id: string; name?: string; provider?: string }): void => {
    const id = entry.id.trim()
    if (!id) {
      return
    }

    algorithms.set(id, {
      id,
      name: normalizeOptionalText(entry.name),
      provider: normalizeOptionalText(entry.provider) || id.split(':')[0],
      supportedForExecution: isQgisAlgorithmApproved(id, { allowPluginAlgorithms })
    })
  }

  for (const record of extractObjects(parsedResult)) {
    const algorithmId = readString(record['algorithmId'], record['id'], record['name'])
    if (!algorithmId || !isQgisAlgorithmIdentifier(algorithmId)) {
      continue
    }

    pushAlgorithm({
      id: algorithmId,
      name: readString(record['display_name'], record['name'], record['label']),
      provider: readString(record['provider'], record['providerId'])
    })
  }

  if (algorithms.size === 0) {
    for (const line of stdout.split(/\r?\n/u)) {
      const match = line.trim().match(/^([A-Za-z0-9_]+:[A-Za-z0-9_]+)(?:\s+-\s+(.+))?$/)
      if (!match?.[1]) {
        continue
      }

      pushAlgorithm({
        id: match[1],
        name: match[2]
      })
    }
  }

  return Array.from(algorithms.values()).sort((left, right) => left.id.localeCompare(right.id))
}

function buildPluginFlags(allowPluginAlgorithms: boolean): string[] {
  return allowPluginAlgorithms ? [] : ['--skip-loading-plugins']
}

function compareScoredEntries(
  left: { entry: QgisAlgorithmCatalogEntry; score: number },
  right: { entry: QgisAlgorithmCatalogEntry; score: number }
): number {
  if (left.score !== right.score) {
    return right.score - left.score
  }

  if (left.entry.supportedForExecution !== right.entry.supportedForExecution) {
    return left.entry.supportedForExecution ? -1 : 1
  }

  return compareCatalogEntries(left.entry, right.entry)
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

function extractObjects(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) {
    return value.filter(isRecord)
  }

  if (!isRecord(value)) {
    return []
  }

  const nestedArrays = Object.values(value).filter(Array.isArray)
  for (const nestedArray of nestedArrays) {
    const records = (nestedArray as unknown[]).filter(isRecord)
    if (records.length > 0) {
      return records
    }
  }

  return [value]
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

function isQgisAlgorithmIdentifier(value: string): boolean {
  return /^[A-Za-z0-9_]+:[A-Za-z0-9_]+$/.test(value.trim())
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

function isCatalogEntry(value: unknown): value is QgisAlgorithmCatalogEntry {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    typeof value['supportedForExecution'] === 'boolean'
  )
}
