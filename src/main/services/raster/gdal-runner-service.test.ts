import { delimiter, join } from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getAppPath: () => '/mock/app'
  }
}))

import { __testing, type GdalRuntimePaths } from './gdal-runner-service'

function createRuntimePaths(overrides: Partial<GdalRuntimePaths> = {}): GdalRuntimePaths {
  return {
    binDirectory: '/opt/gdal/bin',
    gdalDataDirectory: '/opt/gdal/share/gdal',
    projDirectory: '/opt/gdal/share/proj',
    gdalPluginsDirectory: '/opt/gdal/plugins',
    libraryDirectory: '/opt/gdal/lib',
    ...overrides
  }
}

describe('gdal-runner-service', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('resolves platform directory aliases for darwin and windows', () => {
    const darwinAliases = __testing.resolvePlatformDirectoryNames('darwin', 'arm64')
    expect(darwinAliases).toEqual(
      expect.arrayContaining(['darwin-arm64', 'macos-arm64', 'macos', 'darwin', 'mac'])
    )

    const windowsAliases = __testing.resolvePlatformDirectoryNames('win32', 'x64')
    expect(windowsAliases).toEqual(
      expect.arrayContaining(['win32-x64', 'windows-x64', 'windows', 'win32', 'win'])
    )
  })

  it('prioritizes platform-scoped GDAL roots before shared roots', () => {
    const root = '/workspace/resources/gdal'
    const candidates = __testing.resolveScopedRootCandidates([root], 'linux', 'x64')
    const linuxRoot = join(root, 'linux')

    expect(candidates).toContain(linuxRoot)
    expect(candidates).toContain(root)
    expect(candidates.indexOf(linuxRoot)).toBeLessThan(candidates.indexOf(root))
  })

  it('uses platform-specific executable suffix rules', () => {
    expect(__testing.resolveExecutableSuffix('win32')).toBe('.exe')
    expect(__testing.resolveExecutableSuffix('linux')).toBe('')
    expect(__testing.resolveExecutableSuffix('darwin')).toBe('')
  })

  it('enables system fallback only for macOS and linux', () => {
    expect(__testing.allowsSystemGdalFallback('darwin')).toBe(true)
    expect(__testing.allowsSystemGdalFallback('linux')).toBe(true)
    expect(__testing.allowsSystemGdalFallback('win32')).toBe(false)
  })

  it('resolves bundled vs system command paths', () => {
    expect(__testing.resolveCommand('gdalinfo', '/opt/gdal/bin', 'linux', 'bundled')).toBe(
      '/opt/gdal/bin/gdalinfo'
    )
    expect(__testing.resolveCommand('gdalinfo', null, 'linux', 'system')).toBe('gdalinfo')
    expect(__testing.resolveCommand('gdalinfo', '/opt/gdal/bin', 'win32', 'bundled')).toBe(
      '/opt/gdal/bin/gdalinfo.exe'
    )
  })

  it('injects unix library path variables for linux and macOS', () => {
    const linuxEnv = __testing.buildGdalEnvironment(createRuntimePaths(), 'linux')
    expect(linuxEnv.PATH?.split(delimiter)[0]).toBe('/opt/gdal/bin')
    expect(linuxEnv.LD_LIBRARY_PATH?.split(delimiter)[0]).toBe('/opt/gdal/lib')
    expect(linuxEnv.GDAL_DRIVER_PATH).toBe('/opt/gdal/plugins')

    const darwinEnv = __testing.buildGdalEnvironment(createRuntimePaths(), 'darwin')
    expect(darwinEnv.DYLD_LIBRARY_PATH?.split(delimiter)[0]).toBe('/opt/gdal/lib')
    expect(darwinEnv.DYLD_FALLBACK_LIBRARY_PATH?.split(delimiter)[0]).toBe('/opt/gdal/lib')
  })

  it('disables plugins when none are configured', () => {
    const env = __testing.buildGdalEnvironment(
      createRuntimePaths({
        gdalPluginsDirectory: null
      }),
      'linux'
    )

    expect(env.GDAL_DRIVER_PATH).toBe('disable')
  })

  it('preserves system GDAL plugin path unless explicitly disabled', () => {
    vi.stubEnv('GDAL_DRIVER_PATH', '/usr/lib/gdal/plugins')

    const systemEnv = __testing.buildGdalEnvironment(
      createRuntimePaths({
        gdalPluginsDirectory: null
      }),
      'linux',
      'system'
    )
    expect(systemEnv.GDAL_DRIVER_PATH).toBe('/usr/lib/gdal/plugins')

    vi.stubEnv('ARION_GDAL_ENABLE_PLUGINS', '0')
    const disabledEnv = __testing.buildGdalEnvironment(
      createRuntimePaths({
        gdalPluginsDirectory: null
      }),
      'linux',
      'system'
    )
    expect(disabledEnv.GDAL_DRIVER_PATH).toBe('disable')
  })
})
