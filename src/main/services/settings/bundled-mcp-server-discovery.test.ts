import fs from 'fs'
import os from 'os'
import path from 'path'
import { describe, expect, it } from 'vitest'
import {
  discoverBundledMcpServers,
  getBundledMcpDisplayName,
  getBundledMcpLegacyName,
  resolveBundledMcpServersRoot,
  resolveDefaultPythonCommand,
  shouldRefreshBundledMcpCommand,
  shouldRefreshBundledMcpServerName
} from './bundled-mcp-server-discovery'

describe('bundled-mcp-server-discovery', () => {
  it('prefers the packaged resources directory when bundled MCP servers are present', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'arion-bundled-mcp-'))

    try {
      const resourcesRoot = path.join(tempRoot, 'resources')
      const repoRoot = path.join(tempRoot, 'repo')
      fs.mkdirSync(path.join(resourcesRoot, 'mcp-servers'), { recursive: true })
      fs.mkdirSync(path.join(repoRoot, 'mcp-servers'), { recursive: true })

      const resolved = resolveBundledMcpServersRoot({
        getResourcesPath: () => resourcesRoot,
        getAppPath: () => repoRoot,
        getCwd: () => tempRoot
      })

      expect(resolved).toBe(path.join(resourcesRoot, 'mcp-servers'))
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  it('discovers bundled Python servers recursively and keeps them disabled by default', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'arion-bundled-mcp-'))

    try {
      const repoRoot = path.join(tempRoot, 'repo')
      const mcpRoot = path.join(repoRoot, 'mcp-servers')
      const rasterDir = path.join(mcpRoot, 'geospatial-analysis', 'raster')
      const webDir = path.join(mcpRoot, 'web-scraping')
      const cacheDir = path.join(mcpRoot, 'postgresql', '__pycache__')

      fs.mkdirSync(rasterDir, { recursive: true })
      fs.mkdirSync(webDir, { recursive: true })
      fs.mkdirSync(cacheDir, { recursive: true })
      fs.writeFileSync(path.join(rasterDir, 'raster_metadata.py'), '# server')
      fs.writeFileSync(path.join(webDir, 'web_scraper.py'), '# server')
      fs.writeFileSync(path.join(cacheDir, 'ignored.pyc'), '')

      const bundledServers = discoverBundledMcpServers({
        getAppPath: () => repoRoot,
        getCwd: () => tempRoot,
        platform: 'linux',
        resolvePythonExecutable: (command) =>
          command === 'python3' ? '/usr/bin/python3.12' : null,
        commandExists: (command) => command === 'python3'
      })

      expect(bundledServers).toEqual([
        {
          id: 'bundled-mcp:geospatial-analysis/raster/raster_metadata.py',
          name: 'Raster Metadata',
          legacyName: 'Geospatial Analysis / Raster / Raster Metadata',
          command: '/usr/bin/python3.12',
          args: [path.join(rasterDir, 'raster_metadata.py')],
          enabled: false
        },
        {
          id: 'bundled-mcp:web-scraping/web_scraper.py',
          name: 'Web Scraper',
          legacyName: 'Web Scraping / Web Scraper',
          command: '/usr/bin/python3.12',
          args: [path.join(webDir, 'web_scraper.py')],
          enabled: false
        }
      ])
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  it('falls back to the first platform-specific Python candidate when no command can be detected', () => {
    expect(
      resolveDefaultPythonCommand({
        platform: 'win32',
        resolvePythonExecutable: () => null,
        commandExists: () => false
      })
    ).toBe('py')

    expect(
      resolveDefaultPythonCommand({
        platform: 'linux',
        resolvePythonExecutable: () => null,
        commandExists: () => false
      })
    ).toBe('python3')
  })

  it('prefers an absolute interpreter path over an earlier generic launcher fallback', () => {
    expect(
      resolveDefaultPythonCommand({
        platform: 'win32',
        resolvePythonExecutable: (command) =>
          command === 'python' ? 'C:\\Python312\\python.exe' : null,
        commandExists: (command) => command === 'py' || command === 'python'
      })
    ).toBe('C:\\Python312\\python.exe')
  })

  it('refreshes previously seeded generic Python commands to an absolute interpreter path', () => {
    expect(shouldRefreshBundledMcpCommand('py', { platform: 'win32' })).toBe(true)
    expect(shouldRefreshBundledMcpCommand('python.exe', { platform: 'win32' })).toBe(true)
    expect(shouldRefreshBundledMcpCommand('python3', { platform: 'linux' })).toBe(true)
    expect(shouldRefreshBundledMcpCommand('/usr/bin/python3.12', { platform: 'linux' })).toBe(false)
    expect(shouldRefreshBundledMcpCommand('C:\\Python312\\python.exe', { platform: 'win32' })).toBe(
      false
    )
  })

  it('derives short display names while preserving the legacy path-style name for migration', () => {
    const relativeScriptPath = 'geospatial-analysis/raster/raster_metadata.py'

    expect(getBundledMcpDisplayName(relativeScriptPath)).toBe('Raster Metadata')
    expect(getBundledMcpLegacyName(relativeScriptPath)).toBe(
      'Geospatial Analysis / Raster / Raster Metadata'
    )
  })

  it('refreshes previously seeded legacy names without overwriting custom names', () => {
    const server = {
      name: 'Raster Metadata',
      legacyName: 'Geospatial Analysis / Raster / Raster Metadata'
    }

    expect(shouldRefreshBundledMcpServerName('', server)).toBe(true)
    expect(
      shouldRefreshBundledMcpServerName('Geospatial Analysis / Raster / Raster Metadata', server)
    ).toBe(true)
    expect(shouldRefreshBundledMcpServerName('Raster Metadata', server)).toBe(false)
    expect(shouldRefreshBundledMcpServerName('Custom Raster Server', server)).toBe(false)
  })
})
