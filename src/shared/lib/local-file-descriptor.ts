import type { LocalFileDescriptor } from '../ipc-types'

interface LocalFileDescriptorInput {
  name: string
  size: number
  lastModified: number
  type?: string | null
}

export function createLocalFileDescriptor(input: LocalFileDescriptorInput): LocalFileDescriptor {
  return {
    name: input.name,
    size: input.size,
    lastModified: input.lastModified,
    type: input.type ?? ''
  }
}

export function getLocalFileDescriptorKey(descriptor: LocalFileDescriptor): string {
  return JSON.stringify([
    descriptor.name,
    descriptor.size,
    descriptor.lastModified,
    descriptor.type
  ])
}
