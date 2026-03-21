import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { isPathInsideDirectory } from '../../security/path-security'
import { ExternalRuntimeWorkspaceService } from './external-runtime-workspace-service'

describe('ExternalRuntimeWorkspaceService', () => {
  const tempDirectories: string[] = []

  afterEach(async () => {
    await Promise.all(
      tempDirectories
        .splice(0)
        .map((directoryPath) => fs.rm(directoryPath, { recursive: true, force: true }))
    )
  })

  it('keeps workspaces inside the managed external-runtime-runs root for unsafe ids', async () => {
    const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'arion-runtime-workspace-'))
    tempDirectories.push(userDataPath)

    const service = new ExternalRuntimeWorkspaceService(
      () => [],
      () => userDataPath
    )
    const prepared = await service.prepareRun('run-123', {
      runtimeId: 'codex',
      runtimeName: 'Codex',
      chatId: '..',
      goal: 'Summarize the staged workspace.'
    })

    expect(
      isPathInsideDirectory(
        prepared.workspacePath,
        path.join(userDataPath, 'external-runtime-runs')
      )
    ).toBe(true)
    expect(path.basename(path.dirname(prepared.workspacePath))).toBe('chat')
  })
})
