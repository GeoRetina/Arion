import type { LocalFileDescriptor } from '../shared/ipc-types'
import {
  createLocalFileDescriptor,
  getLocalFileDescriptorKey
} from '../shared/lib/local-file-descriptor'

const DEFAULT_LOCAL_IMPORT_PATH_TTL_MS = 15 * 60 * 1000
const DEFAULT_MAX_TRACKED_LOCAL_IMPORT_PATH_KEYS = 256

interface TrackedLocalImportPath {
  path: string
  recordedAt: number
}

interface LocalImportPathRegistryOptions {
  ttlMs?: number
  maxKeys?: number
}

export class LocalImportPathRegistry {
  private readonly trackedPaths = new Map<string, TrackedLocalImportPath>()
  private readonly ttlMs: number
  private readonly maxKeys: number

  constructor(options: LocalImportPathRegistryOptions = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_LOCAL_IMPORT_PATH_TTL_MS
    this.maxKeys = options.maxKeys ?? DEFAULT_MAX_TRACKED_LOCAL_IMPORT_PATH_KEYS
  }

  registerFile(file: File, resolvePath: (file: File) => string): void {
    const localPath = resolvePath(file)
    if (!localPath) {
      return
    }

    const descriptor = createLocalFileDescriptor({
      name: file.name,
      size: file.size,
      lastModified: file.lastModified,
      type: file.type
    })

    this.registerPath(descriptor, localPath)
  }

  registerFiles(fileList: FileList | null | undefined, resolvePath: (file: File) => string): void {
    if (!fileList?.length) {
      return
    }

    for (const file of Array.from(fileList)) {
      this.registerFile(file, resolvePath)
    }
  }

  registerPath(descriptor: LocalFileDescriptor, path: string, recordedAt = Date.now()): void {
    if (!path) {
      return
    }

    this.trackedPaths.set(getLocalFileDescriptorKey(descriptor), {
      path,
      recordedAt
    })
    this.prune(recordedAt)
  }

  resolvePath(descriptor: LocalFileDescriptor, now = Date.now()): string | null {
    this.prune(now)
    return this.trackedPaths.get(getLocalFileDescriptorKey(descriptor))?.path ?? null
  }

  private prune(now = Date.now()): void {
    const cutoff = now - this.ttlMs

    for (const [key, entry] of this.trackedPaths.entries()) {
      if (entry.recordedAt < cutoff) {
        this.trackedPaths.delete(key)
      }
    }

    if (this.trackedPaths.size <= this.maxKeys) {
      return
    }

    const keysByOldestEntry = Array.from(this.trackedPaths.entries())
      .sort((left, right) => left[1].recordedAt - right[1].recordedAt)
      .map(([key]) => key)

    for (const key of keysByOldestEntry) {
      if (this.trackedPaths.size <= this.maxKeys) {
        break
      }

      this.trackedPaths.delete(key)
    }
  }
}
