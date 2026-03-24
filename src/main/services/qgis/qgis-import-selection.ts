import type { QgisArtifactRecord } from './types'

export interface QgisArtifactImportSelection {
  artifacts: QgisArtifactRecord[]
  artifactsToImport: QgisArtifactRecord[]
}

export function selectQgisArtifactsForImport(input: {
  artifacts: QgisArtifactRecord[]
  importPreference?: 'none' | 'suggest' | 'auto'
  outputsToImport?: string[]
}): QgisArtifactImportSelection {
  const requestedPaths = new Set(
    (input.outputsToImport || []).map((artifactPath) => toArtifactLookupKey(artifactPath))
  )
  const useExplicitSelection = requestedPaths.size > 0

  const artifacts = input.artifacts.map((artifact) => {
    const selectedForImport =
      input.importPreference === 'auto' &&
      isImportableMapArtifact(artifact) &&
      (useExplicitSelection ? requestedPaths.has(toArtifactLookupKey(artifact.path)) : true)

    return {
      ...artifact,
      selectedForImport
    }
  })

  return {
    artifacts,
    artifactsToImport: artifacts.filter((artifact) => artifact.selectedForImport === true)
  }
}

function isImportableMapArtifact(artifact: QgisArtifactRecord): boolean {
  return artifact.exists && (artifact.kind === 'vector' || artifact.kind === 'raster')
}

function toArtifactLookupKey(filePath: string): string {
  const normalizedPath = filePath.replace(/[\\/]+/g, '/')
  return process.platform === 'win32' ? normalizedPath.toLowerCase() : normalizedPath
}
