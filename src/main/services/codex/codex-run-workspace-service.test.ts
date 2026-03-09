import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { isPathInsideDirectory } from '../../security/path-security'
import { CodexRunWorkspaceService } from './codex-run-workspace-service'

describe('CodexRunWorkspaceService', () => {
  const tempDirectories: string[] = []

  afterEach(async () => {
    await Promise.all(
      tempDirectories.splice(0).map((directoryPath) =>
        fs.rm(directoryPath, { recursive: true, force: true })
      )
    )
  })

  it('keeps workspaces inside the managed codex-runs root for unsafe chat ids', async () => {
    const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'arion-codex-workspace-'))
    tempDirectories.push(userDataPath)

    const service = new CodexRunWorkspaceService(() => [], () => userDataPath)
    const prepared = await service.prepareRun('run-123', {
      chatId: '..',
      goal: 'Summarize the staged workspace.'
    })

    expect(isPathInsideDirectory(prepared.workspacePath, path.join(userDataPath, 'codex-runs'))).toBe(
      true
    )
    expect(path.basename(path.dirname(prepared.workspacePath))).toBe('chat')
  })
})
