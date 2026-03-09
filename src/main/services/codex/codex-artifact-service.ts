import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import type { CodexRunArtifact } from '../../../shared/ipc-types'
import { isPathInsideDirectory } from '../../security/path-security'

function toPosixRelativePath(rootPath: string, filePath: string): string {
  return path.relative(rootPath, filePath).split(path.sep).join('/')
}

function classifyArtifact(
  filePath: string
): Pick<CodexRunArtifact, 'type' | 'importKind' | 'mimeType'> {
  const extension = path.extname(filePath).toLowerCase()

  switch (extension) {
    case '.md':
      return { type: 'markdown', importKind: 'attachment', mimeType: 'text/markdown' }
    case '.txt':
      return { type: 'text', importKind: 'attachment', mimeType: 'text/plain' }
    case '.py':
      return { type: 'python', importKind: 'script', mimeType: 'text/x-python' }
    case '.geojson':
      return { type: 'geojson', importKind: 'map-layer', mimeType: 'application/geo+json' }
    case '.csv':
      return { type: 'csv', importKind: 'table', mimeType: 'text/csv' }
    case '.png':
      return { type: 'image', importKind: 'attachment', mimeType: 'image/png' }
    case '.jpg':
    case '.jpeg':
      return { type: 'image', importKind: 'attachment', mimeType: 'image/jpeg' }
    case '.sql':
      return { type: 'sql', importKind: 'script', mimeType: 'application/sql' }
    case '.json':
      return { type: 'json', importKind: 'none', mimeType: 'application/json' }
    default:
      return { type: 'unknown', importKind: 'none', mimeType: null }
  }
}

function walkDirectory(currentPath: string, entries: string[]): void {
  const directoryEntries = fs.readdirSync(currentPath, { withFileTypes: true })
  for (const entry of directoryEntries) {
    const nextPath = path.join(currentPath, entry.name)
    if (entry.isDirectory()) {
      walkDirectory(nextPath, entries)
      continue
    }

    if (entry.isFile()) {
      entries.push(nextPath)
    }
  }
}

export class CodexArtifactService {
  scanOutputs(outputsPath: string): CodexRunArtifact[] {
    if (!fs.existsSync(outputsPath)) {
      return []
    }

    const files: string[] = []
    walkDirectory(outputsPath, files)

    return files
      .filter((filePath) => isPathInsideDirectory(filePath, outputsPath))
      .map((filePath) => {
        const stats = fs.statSync(filePath)
        const classified = classifyArtifact(filePath)
        return {
          id: randomUUID(),
          name: path.basename(filePath),
          path: filePath,
          relativePath: toPosixRelativePath(outputsPath, filePath),
          type: classified.type,
          importKind: classified.importKind,
          mimeType: classified.mimeType,
          sizeBytes: stats.size
        } satisfies CodexRunArtifact
      })
      .sort((left, right) => left.relativePath.localeCompare(right.relativePath))
  }

  readPrimarySummary(artifacts: CodexRunArtifact[]): string | null {
    const summaryArtifact = artifacts.find(
      (artifact) => artifact.type === 'markdown' || artifact.type === 'text'
    )
    if (!summaryArtifact) {
      return null
    }

    try {
      const content = fs.readFileSync(summaryArtifact.path, 'utf8').trim()
      return content.length > 0 ? content : null
    } catch {
      return null
    }
  }
}
