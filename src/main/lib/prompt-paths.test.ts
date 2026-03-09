import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { resolvePromptPath, resolvePromptsBasePath } from './prompt-paths'

describe('prompt-paths', () => {
  let tempRoot: string | null = null

  afterEach(() => {
    if (tempRoot) {
      fs.rmSync(tempRoot, { recursive: true, force: true })
      tempRoot = null
    }
  })

  it('prefers built prompts when they exist', () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'arion-prompt-paths-'))

    const builtPromptsDir = path.join(tempRoot, 'out', 'main', 'prompts')
    const sourcePromptsDir = path.join(tempRoot, 'src', 'main', 'prompts')
    fs.mkdirSync(builtPromptsDir, { recursive: true })
    fs.mkdirSync(sourcePromptsDir, { recursive: true })

    const promptFileName = 'arion-system-prompt.xml'
    fs.writeFileSync(path.join(builtPromptsDir, promptFileName), '<prompt>built</prompt>', 'utf8')
    fs.writeFileSync(path.join(sourcePromptsDir, promptFileName), '<prompt>source</prompt>', 'utf8')

    expect(resolvePromptsBasePath({ appPath: tempRoot })).toBe(builtPromptsDir)
    expect(resolvePromptPath(promptFileName, { appPath: tempRoot })).toBe(
      path.join(builtPromptsDir, promptFileName)
    )
  })

  it('falls back to source prompts when built prompts are missing', () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'arion-prompt-paths-'))

    const sourcePromptsDir = path.join(tempRoot, 'src', 'main', 'prompts')
    fs.mkdirSync(sourcePromptsDir, { recursive: true })

    const promptFileName = 'result-synthesis.xml'
    fs.writeFileSync(path.join(sourcePromptsDir, promptFileName), '<prompt>source</prompt>', 'utf8')

    expect(resolvePromptsBasePath({ appPath: tempRoot })).toBe(sourcePromptsDir)
    expect(resolvePromptPath(promptFileName, { appPath: tempRoot })).toBe(
      path.join(sourcePromptsDir, promptFileName)
    )
  })
})
