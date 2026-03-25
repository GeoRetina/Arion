import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadShapefileReaderInput } from './shapefile-source-loader'

const createdDirectories: string[] = []

describe('shapefile-source-loader', () => {
  afterEach(async () => {
    await Promise.all(
      createdDirectories.splice(0).map(async (directoryPath) => {
        await fs.rm(directoryPath, { recursive: true, force: true })
      })
    )
  })

  it('returns the raw buffer for zipped shapefiles', async () => {
    const directoryPath = await createTempDirectory()
    const zipPath = join(directoryPath, 'roads.zip')

    await fs.writeFile(zipPath, Buffer.from('zip-bytes'))

    const input = await loadShapefileReaderInput(zipPath)

    expect(Buffer.isBuffer(input)).toBe(true)
    if (!Buffer.isBuffer(input)) {
      throw new Error('Expected zipped shapefile input to be a Buffer')
    }
    expect(input).toEqual(Buffer.from('zip-bytes'))
  })

  it('loads sibling shapefile sidecars for standalone .shp imports', async () => {
    const directoryPath = await createTempDirectory()
    const shpPath = join(directoryPath, 'roads.shp')

    await fs.writeFile(shpPath, Buffer.from('shp-bytes'))
    await fs.writeFile(join(directoryPath, 'roads.DBF'), Buffer.from('dbf-bytes'))
    await fs.writeFile(join(directoryPath, 'roads.prj'), Buffer.from('prj-bytes'))
    await fs.writeFile(join(directoryPath, 'roads.CPG'), Buffer.from('cpg-bytes'))

    const input = await loadShapefileReaderInput(shpPath)

    expect(Buffer.isBuffer(input)).toBe(false)
    expect(input).toMatchObject({
      shp: Buffer.from('shp-bytes'),
      dbf: Buffer.from('dbf-bytes'),
      prj: Buffer.from('prj-bytes'),
      cpg: Buffer.from('cpg-bytes')
    })
  })

  it('omits missing optional sidecars for standalone .shp imports', async () => {
    const directoryPath = await createTempDirectory()
    const shpPath = join(directoryPath, 'roads.shp')

    await fs.writeFile(shpPath, Buffer.from('shp-bytes'))

    const input = await loadShapefileReaderInput(shpPath)

    expect(Buffer.isBuffer(input)).toBe(false)
    expect(input).toMatchObject({
      shp: Buffer.from('shp-bytes')
    })
    expect(input).not.toHaveProperty('dbf')
    expect(input).not.toHaveProperty('prj')
    expect(input).not.toHaveProperty('cpg')
  })
})

async function createTempDirectory(): Promise<string> {
  const directoryPath = await fs.mkdtemp(join(tmpdir(), 'arion-shapefile-loader-'))
  createdDirectories.push(directoryPath)
  return directoryPath
}
