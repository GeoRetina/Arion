import * as fs from 'fs'
import * as path from 'path'

export interface MigrationPathEnvironment {
  appPath?: string | null
  currentDir?: string | null
  cwd?: string | null
  resourcesPath?: string | null
}

export function getMigrationBasePathCandidates({
  appPath,
  currentDir,
  cwd,
  resourcesPath
}: MigrationPathEnvironment): string[] {
  const candidates = [
    appPath ? path.join(appPath, 'out', 'database', 'migrations') : null,
    appPath ? path.join(appPath, 'out', 'main', 'database', 'migrations') : null,
    appPath ? path.join(appPath, 'src', 'main', 'database', 'migrations') : null,
    currentDir ? path.join(currentDir, '../../database/migrations') : null,
    currentDir ? path.join(currentDir, '../database/migrations') : null,
    cwd ? path.join(cwd, 'out', 'database', 'migrations') : null,
    resourcesPath ? path.join(resourcesPath, 'database', 'migrations') : null
  ].filter((candidatePath): candidatePath is string => Boolean(candidatePath))

  return Array.from(new Set(candidates))
}

export function resolveMigrationPath(
  fileName: string,
  environment: MigrationPathEnvironment
): string {
  const candidatePaths = getMigrationBasePathCandidates(environment).map((basePath) =>
    path.join(basePath, fileName)
  )
  const matchingPath = candidatePaths.find((candidatePath) => fs.existsSync(candidatePath))

  if (!matchingPath) {
    throw new Error(
      `Migration file not found: ${fileName}. Searched paths: ${candidatePaths.join(', ')}`
    )
  }

  return matchingPath
}
