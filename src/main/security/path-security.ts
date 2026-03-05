import fs from 'fs'
import path from 'path'

const WINDOWS_DRIVE_PATH = /^[a-zA-Z]:[\\/]/

const tryRealPath = (candidatePath: string): string => {
  try {
    return fs.realpathSync.native(candidatePath)
  } catch {
    return path.resolve(candidatePath)
  }
}

export const isNetworkPath = (value: string): boolean => {
  const trimmed = value.trim()
  return trimmed.startsWith('\\\\') || trimmed.startsWith('//')
}

export const looksLikeFilesystemPath = (value: string): boolean => {
  const trimmed = value.trim()
  return WINDOWS_DRIVE_PATH.test(trimmed) || trimmed.includes('\\') || trimmed.includes('/')
}

export const ensureLocalFilesystemPath = (value: string, label: string): string => {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error(`${label} is required`)
  }

  if (isNetworkPath(trimmed)) {
    throw new Error(`${label} must be a local filesystem path`)
  }

  return path.resolve(trimmed)
}

export const ensureLocalCommandOrExecutable = (value: string): string => {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error('MCP command is required')
  }

  if (looksLikeFilesystemPath(trimmed) && isNetworkPath(trimmed)) {
    throw new Error('Network executable paths are not allowed')
  }

  return looksLikeFilesystemPath(trimmed) ? path.resolve(trimmed) : trimmed
}

export const isPathInsideDirectory = (candidatePath: string, rootPath: string): boolean => {
  const resolvedRoot = tryRealPath(rootPath)
  const resolvedCandidate = tryRealPath(candidatePath)
  const relative = path.relative(resolvedRoot, resolvedCandidate)
  return relative.length === 0 || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

export const parseHttpsUrl = (value: string): URL | null => {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' ? parsed : null
  } catch {
    return null
  }
}
