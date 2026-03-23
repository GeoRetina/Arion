import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { runQgisLauncherCommand } = vi.hoisted(() => ({
  runQgisLauncherCommand: vi.fn()
}))

vi.mock('./qgis-command-runner', () => ({
  runQgisLauncherCommand
}))

import { QgisDiscoveryService } from './qgis-discovery-service'

describe('QgisDiscoveryService', () => {
  let tempRoot: string

  beforeEach(() => {
    runQgisLauncherCommand.mockReset()
  })

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'arion-qgis-discovery-'))
  })

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true })
  })

  it('prefers a valid manual launcher over env and PATH candidates', async () => {
    const manualPath = path.join(tempRoot, 'manual', 'bin', 'qgis_process-qgis.bat')
    const envPath = path.join(tempRoot, 'env', 'bin', 'qgis_process-qgis.bat')
    const pathLookup = path.join(tempRoot, 'path', 'bin', 'qgis_process-qgis.bat')

    await Promise.all(
      [manualPath, envPath, pathLookup].map(async (candidatePath) => {
        await fs.mkdir(path.dirname(candidatePath), { recursive: true })
        await fs.writeFile(candidatePath, 'echo qgis', 'utf8')
      })
    )

    runQgisLauncherCommand.mockImplementation(
      async ({ launcherPath }: { launcherPath: string }) => ({
        stdout: launcherPath === manualPath ? 'QGIS 3.40.1-Bratislava' : 'QGIS 3.34.0-Prizren',
        stderr: '',
        exitCode: 0,
        durationMs: 5
      })
    )

    const service = new QgisDiscoveryService({
      platform: 'win32',
      env: {
        ARION_QGIS_LAUNCHER: envPath
      },
      pathExists: async (candidatePath) =>
        [manualPath, envPath, pathLookup].includes(candidatePath),
      listDirectory: async () => [],
      queryWindowsRegistry: async () => [],
      which: async () => [pathLookup]
    })

    const result = await service.discover({
      detectionMode: 'manual',
      launcherPath: manualPath
    })

    expect(result.status).toBe('multiple')
    expect(result.preferredInstallation?.launcherPath).toBe(manualPath)
    expect(result.installations.map((entry) => entry.source)).toEqual(['manual', 'env', 'path'])
  })

  it('returns an invalid result when manual mode points to a missing launcher', async () => {
    const service = new QgisDiscoveryService({
      platform: 'win32',
      env: {},
      pathExists: async () => false,
      listDirectory: async () => [],
      queryWindowsRegistry: async () => [],
      which: async () => []
    })

    const result = await service.discover({
      detectionMode: 'manual',
      launcherPath: 'C:\\Missing\\qgis_process-qgis.bat'
    })

    expect(result.status).toBe('invalid')
    expect(result.preferredInstallation).toBeUndefined()
    expect(result.diagnostics[0]).toContain('No usable QGIS launcher')
  })
})
