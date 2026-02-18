import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { PluginManifestService } from './plugin-manifest-service'

describe('PluginManifestService', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    for (const dir of tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true })
    }
    tempDirs.length = 0
  })

  it('reads and validates a manifest with config schema and default config', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arion-plugin-manifest-'))
    tempDirs.push(rootDir)

    const pluginDir = path.join(rootDir, 'plugin-a')
    fs.mkdirSync(pluginDir, { recursive: true })
    fs.writeFileSync(path.join(pluginDir, 'index.mjs'), 'export default () => {}', 'utf8')
    fs.writeFileSync(
      path.join(pluginDir, 'arion.plugin.json'),
      JSON.stringify(
        {
          id: 'plugin-a',
          name: 'Plugin A',
          version: '1.0.0',
          main: 'index.mjs',
          configSchema: {
            type: 'object',
            properties: {
              enabled: { type: 'boolean' }
            },
            required: ['enabled'],
            additionalProperties: false
          },
          defaultConfig: {
            enabled: true
          }
        },
        null,
        2
      ),
      'utf8'
    )

    const service = new PluginManifestService()
    const result = service.readManifest(path.join(pluginDir, 'arion.plugin.json'), {
      source: 'workspace',
      precedence: 300,
      rootOrder: 0
    })

    expect(result.diagnostics).toHaveLength(0)
    expect(result.manifest?.id).toBe('plugin-a')
    expect(result.manifest?.resolvedMainPath).toBe(path.join(pluginDir, 'index.mjs'))
  })

  it('rejects invalid default config against schema', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arion-plugin-manifest-bad-config-'))
    tempDirs.push(rootDir)

    const pluginDir = path.join(rootDir, 'plugin-b')
    fs.mkdirSync(pluginDir, { recursive: true })
    fs.writeFileSync(path.join(pluginDir, 'index.mjs'), 'export default () => {}', 'utf8')
    fs.writeFileSync(
      path.join(pluginDir, 'arion.plugin.json'),
      JSON.stringify(
        {
          id: 'plugin-b',
          name: 'Plugin B',
          version: '1.0.0',
          main: 'index.mjs',
          configSchema: {
            type: 'object',
            properties: {
              retries: { type: 'integer', minimum: 1 }
            },
            required: ['retries']
          },
          defaultConfig: {
            retries: 0
          }
        },
        null,
        2
      ),
      'utf8'
    )

    const service = new PluginManifestService()
    const result = service.readManifest(path.join(pluginDir, 'arion.plugin.json'), {
      source: 'workspace',
      precedence: 300,
      rootOrder: 0
    })

    expect(result.manifest).toBeNull()
    expect(result.diagnostics).toHaveLength(1)
    expect(result.diagnostics[0]?.code).toBe('manifest_default_config_invalid')
  })
})
