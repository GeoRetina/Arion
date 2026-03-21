import { createLocalFileDescriptor } from '../../../../../shared/lib/local-file-descriptor'

export async function resolveLocalImportFilePath(file: File): Promise<string | null> {
  return await window.ctg.layers.resolveImportFilePath(
    createLocalFileDescriptor({
      name: file.name,
      size: file.size,
      lastModified: file.lastModified,
      type: file.type
    })
  )
}
