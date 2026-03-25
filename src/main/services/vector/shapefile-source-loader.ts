import { promises as fs } from 'fs'
import { basename, dirname, extname, join } from 'path'

type ShapefileBinaryInput = ArrayBuffer | ArrayBufferView

export interface ShapefileFileSetInput {
  shp: ShapefileBinaryInput
  dbf?: ShapefileBinaryInput
  prj?: string | ShapefileBinaryInput
  cpg?: string | ShapefileBinaryInput
}

export type ShapefileReaderInput = ShapefileBinaryInput | ShapefileFileSetInput

const SHAPEFILE_OPTIONAL_SIDECAR_EXTENSIONS = ['.dbf', '.prj', '.cpg'] as const

type ShapefileOptionalSidecarExtension = (typeof SHAPEFILE_OPTIONAL_SIDECAR_EXTENSIONS)[number]

export async function loadShapefileReaderInput(sourcePath: string): Promise<ShapefileReaderInput> {
  const extension = extname(sourcePath).toLowerCase()

  if (extension === '.zip') {
    return await fs.readFile(sourcePath)
  }

  if (extension === '.shp') {
    return await loadShapefileFileSet(sourcePath)
  }

  throw new Error(`Unsupported shapefile source extension: ${extension || 'unknown'}`)
}

async function loadShapefileFileSet(sourcePath: string): Promise<ShapefileFileSetInput> {
  const sidecarPaths = await resolveShapefileSidecarPaths(sourcePath)
  const shp = await fs.readFile(sourcePath)
  const [dbf, prj, cpg] = await Promise.all([
    readOptionalSidecar(sidecarPaths['.dbf']),
    readOptionalSidecar(sidecarPaths['.prj']),
    readOptionalSidecar(sidecarPaths['.cpg'])
  ])

  return {
    shp,
    ...(dbf ? { dbf } : {}),
    ...(prj ? { prj } : {}),
    ...(cpg ? { cpg } : {})
  }
}

async function resolveShapefileSidecarPaths(
  sourcePath: string
): Promise<Partial<Record<ShapefileOptionalSidecarExtension, string>>> {
  const sourceDirectory = dirname(sourcePath)
  const expectedBaseName = basename(sourcePath, extname(sourcePath)).toLowerCase()
  const entries = await fs.readdir(sourceDirectory, { withFileTypes: true })
  const sidecarPaths: Partial<Record<ShapefileOptionalSidecarExtension, string>> = {}

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue
    }

    const entryExtension = extname(entry.name).toLowerCase()
    if (!isShapefileOptionalSidecarExtension(entryExtension)) {
      continue
    }

    const entryBaseName = basename(entry.name, extname(entry.name)).toLowerCase()
    if (entryBaseName !== expectedBaseName) {
      continue
    }

    sidecarPaths[entryExtension] = join(sourceDirectory, entry.name)
  }

  return sidecarPaths
}

async function readOptionalSidecar(path: string | undefined): Promise<Buffer | undefined> {
  if (!path) {
    return undefined
  }

  try {
    return await fs.readFile(path)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      return undefined
    }

    throw error
  }
}

function isShapefileOptionalSidecarExtension(
  value: string
): value is ShapefileOptionalSidecarExtension {
  return SHAPEFILE_OPTIONAL_SIDECAR_EXTENSIONS.includes(value as ShapefileOptionalSidecarExtension)
}
