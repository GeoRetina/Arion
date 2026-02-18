import fs from 'fs'
import path from 'path'
import { z } from 'zod'
import type { PluginDiagnosticEntry, PluginSource } from '../../../shared/ipc-types'
import { createDiagnostic } from './plugin-diagnostic-utils'
import type { ArionPluginManifest, ResolvedPluginManifest } from './plugin-types'
import { validateAgainstJsonSchema, validateJsonSchemaDefinition } from './json-schema-validator'

const manifestSchema = z.object({
  id: z
    .string()
    .trim()
    .min(1, 'id is required')
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/, 'id must use alphanumeric, dot, underscore, hyphen'),
  name: z.string().trim().min(1, 'name is required'),
  version: z.string().trim().min(1, 'version is required'),
  description: z.string().trim().optional(),
  main: z.string().trim().min(1, 'main is required'),
  category: z.string().trim().optional(),
  slots: z.array(z.string().trim().min(1)).optional(),
  enabledByDefault: z.boolean().optional(),
  configSchema: z.record(z.unknown()).optional(),
  defaultConfig: z.record(z.unknown()).optional()
})

export interface PluginManifestReadResult {
  manifest: ResolvedPluginManifest | null
  diagnostics: PluginDiagnosticEntry[]
}

interface ParseManifestOptions {
  source: PluginSource
  precedence: number
  rootOrder: number
}

const dedupeAndSort = (items: string[] | undefined): string[] => {
  if (!Array.isArray(items)) {
    return []
  }

  const unique = new Set<string>()
  for (const item of items) {
    const normalized = item.trim()
    if (normalized.length > 0) {
      unique.add(normalized)
    }
  }

  return Array.from(unique.values()).sort((a, b) => a.localeCompare(b))
}

export class PluginManifestService {
  public readManifest(
    manifestPath: string,
    options: ParseManifestOptions
  ): PluginManifestReadResult {
    const diagnostics: PluginDiagnosticEntry[] = []
    const normalizedManifestPath = path.resolve(manifestPath)
    const directoryPath = path.dirname(normalizedManifestPath)

    if (!fs.existsSync(normalizedManifestPath)) {
      diagnostics.push(
        createDiagnostic('error', 'manifest_missing', 'Plugin manifest file not found', {
          sourcePath: normalizedManifestPath
        })
      )
      return { manifest: null, diagnostics }
    }

    let rawContent = ''
    try {
      rawContent = fs.readFileSync(normalizedManifestPath, 'utf8')
    } catch (error) {
      diagnostics.push(
        createDiagnostic(
          'error',
          'manifest_read_error',
          `Failed to read plugin manifest: ${String(error)}`,
          {
            sourcePath: normalizedManifestPath
          }
        )
      )
      return { manifest: null, diagnostics }
    }

    let parsedJson: unknown
    try {
      parsedJson = JSON.parse(rawContent)
    } catch (error) {
      diagnostics.push(
        createDiagnostic(
          'error',
          'manifest_invalid_json',
          `Manifest JSON parse failed: ${String(error)}`,
          {
            sourcePath: normalizedManifestPath
          }
        )
      )
      return { manifest: null, diagnostics }
    }

    const parsedManifest = manifestSchema.safeParse(parsedJson)
    if (!parsedManifest.success) {
      const flattened = parsedManifest.error.flatten()
      const issues = [
        ...flattened.formErrors,
        ...Object.values(flattened.fieldErrors).flat()
      ].filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
      diagnostics.push(
        createDiagnostic(
          'error',
          'manifest_invalid_shape',
          issues.length > 0 ? issues.join('; ') : 'Manifest is invalid',
          { sourcePath: normalizedManifestPath }
        )
      )
      return { manifest: null, diagnostics }
    }

    const sourceManifest = parsedManifest.data
    const normalizedMainPath = path.resolve(directoryPath, sourceManifest.main)
    if (!fs.existsSync(normalizedMainPath)) {
      diagnostics.push(
        createDiagnostic(
          'error',
          'manifest_main_missing',
          `Plugin main entry not found: ${normalizedMainPath}`,
          {
            pluginId: sourceManifest.id,
            sourcePath: normalizedManifestPath
          }
        )
      )
      return { manifest: null, diagnostics }
    }

    const normalizedSlots = dedupeAndSort(sourceManifest.slots)

    const manifest: ArionPluginManifest = {
      id: sourceManifest.id,
      name: sourceManifest.name,
      version: sourceManifest.version,
      description: sourceManifest.description,
      main: sourceManifest.main,
      category: sourceManifest.category,
      slots: normalizedSlots,
      enabledByDefault: sourceManifest.enabledByDefault,
      configSchema: sourceManifest.configSchema,
      defaultConfig: sourceManifest.defaultConfig
    }

    if (manifest.configSchema) {
      const schemaErrors = validateJsonSchemaDefinition(manifest.configSchema)
      if (schemaErrors.length > 0) {
        diagnostics.push(
          createDiagnostic('error', 'manifest_config_schema_invalid', schemaErrors.join('; '), {
            pluginId: manifest.id,
            sourcePath: normalizedManifestPath
          })
        )
        return { manifest: null, diagnostics }
      }
    }

    if (manifest.configSchema && manifest.defaultConfig) {
      const configErrors = validateAgainstJsonSchema(manifest.defaultConfig, manifest.configSchema)
      if (configErrors.length > 0) {
        diagnostics.push(
          createDiagnostic('error', 'manifest_default_config_invalid', configErrors.join('; '), {
            pluginId: manifest.id,
            sourcePath: normalizedManifestPath
          })
        )
        return { manifest: null, diagnostics }
      }
    }

    return {
      manifest: {
        ...manifest,
        source: options.source,
        sourcePath: normalizedManifestPath,
        directoryPath,
        resolvedMainPath: normalizedMainPath,
        precedence: options.precedence,
        rootOrder: options.rootOrder
      },
      diagnostics
    }
  }

  public validateRuntimeConfig(
    manifest: ResolvedPluginManifest,
    runtimeConfig: unknown
  ): PluginDiagnosticEntry[] {
    if (!manifest.configSchema) {
      return []
    }

    const configValue =
      runtimeConfig && typeof runtimeConfig === 'object' && !Array.isArray(runtimeConfig)
        ? (runtimeConfig as Record<string, unknown>)
        : {}
    const schemaErrors = validateAgainstJsonSchema(configValue, manifest.configSchema)
    if (schemaErrors.length === 0) {
      return []
    }

    return [
      createDiagnostic(
        'error',
        'plugin_config_invalid',
        `Runtime config does not satisfy manifest schema: ${schemaErrors.join('; ')}`,
        {
          pluginId: manifest.id,
          sourcePath: manifest.sourcePath
        }
      )
    ]
  }
}
