import * as fs from 'fs'
import * as path from 'path'

export interface PromptPathEnvironment {
  appPath: string
  resourcesPath?: string | null
}

export function getPromptBasePathCandidates({
  appPath,
  resourcesPath
}: PromptPathEnvironment): string[] {
  const candidates = [
    path.join(appPath, 'out', 'main', 'prompts'),
    path.join(appPath, 'src', 'main', 'prompts')
  ]

  if (resourcesPath) {
    candidates.push(path.join(resourcesPath, 'prompts'))
  }

  return Array.from(new Set(candidates))
}

export function resolvePromptsBasePath(environment: PromptPathEnvironment): string {
  const candidatePaths = getPromptBasePathCandidates(environment)
  const matchingPath = candidatePaths.find((candidatePath) => fs.existsSync(candidatePath))

  if (!matchingPath) {
    throw new Error(`Prompt directory not found. Searched paths: ${candidatePaths.join(', ')}`)
  }

  return matchingPath
}

export function resolvePromptPath(fileName: string, environment: PromptPathEnvironment): string {
  const candidatePaths = getPromptBasePathCandidates(environment).map((basePath) =>
    path.join(basePath, fileName)
  )
  const matchingPath = candidatePaths.find((candidatePath) => fs.existsSync(candidatePath))

  if (!matchingPath) {
    throw new Error(
      `Prompt file not found: ${fileName}. Searched paths: ${candidatePaths.join(', ')}`
    )
  }

  return matchingPath
}
