import { toSafeNumberOrString } from './common'

const textDecoder = new TextDecoder()

export const parseTiffHeaderDetails = (
  bytes: Uint8Array
):
  | {
      valid: true
      byteOrder: 'little-endian' | 'big-endian'
      format: 'ClassicTIFF' | 'BigTIFF'
      firstIfdOffset: number | string
      bigTiffOffsetSize?: number
    }
  | { valid: false; reason: string } => {
  if (bytes.length < 8) {
    return { valid: false, reason: 'Header is too short to parse TIFF metadata.' }
  }

  const isLittle = bytes[0] === 0x49 && bytes[1] === 0x49
  const isBig = bytes[0] === 0x4d && bytes[1] === 0x4d
  if (!isLittle && !isBig) {
    return { valid: false, reason: 'Byte-order marker is not a TIFF signature.' }
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const littleEndian = isLittle
  const magic = view.getUint16(2, littleEndian)

  if (magic === 42) {
    return {
      valid: true,
      byteOrder: littleEndian ? 'little-endian' : 'big-endian',
      format: 'ClassicTIFF',
      firstIfdOffset: view.getUint32(4, littleEndian)
    }
  }

  if (magic === 43) {
    if (bytes.length < 16) {
      return { valid: false, reason: 'Header is too short to parse BigTIFF metadata.' }
    }

    const bigTiffOffsetSize = view.getUint16(4, littleEndian)
    const firstIfdOffset = toSafeNumberOrString(view.getBigUint64(8, littleEndian))

    return {
      valid: true,
      byteOrder: littleEndian ? 'little-endian' : 'big-endian',
      format: 'BigTIFF',
      firstIfdOffset,
      bigTiffOffsetSize
    }
  }

  return { valid: false, reason: `Unsupported TIFF magic number: ${magic}` }
}

export const parsePmtilesHeaderDetails = (
  bytes: Uint8Array
):
  | {
      valid: true
      version: number
      layout?: {
        rootDirectory: { offset: number | string; length: number | string }
        metadata: { offset: number | string; length: number | string }
        leafDirectories: { offset: number | string; length: number | string }
        tileData: { offset: number | string; length: number | string }
      }
      stats?: {
        addressedTiles: number | string
        tileEntries: number | string
        tileContents: number | string
      }
      encoding?: {
        clustered: boolean
        internalCompression: number
        tileCompression: number
        tileType: number
      }
      zoom?: {
        min: number
        max: number
        center: number
      }
      bounds?: {
        minLon: number
        minLat: number
        maxLon: number
        maxLat: number
      }
      center?: {
        lon: number
        lat: number
      }
    }
  | { valid: false; reason: string } => {
  if (bytes.length < 8) {
    return { valid: false, reason: 'Header is too short to parse PMTiles metadata.' }
  }

  const magic = textDecoder.decode(bytes.slice(0, 7))
  if (magic !== 'PMTiles') {
    return { valid: false, reason: 'PMTiles signature is missing from archive header.' }
  }

  const version = bytes[7]
  if (bytes.length < 127) {
    return {
      valid: true,
      version
    }
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const toCoord = (value: number): number => value / 10_000_000
  const readU64 = (offset: number): number | string =>
    toSafeNumberOrString(view.getBigUint64(offset, true))

  return {
    valid: true,
    version,
    layout: {
      rootDirectory: { offset: readU64(8), length: readU64(16) },
      metadata: { offset: readU64(24), length: readU64(32) },
      leafDirectories: { offset: readU64(40), length: readU64(48) },
      tileData: { offset: readU64(56), length: readU64(64) }
    },
    stats: {
      addressedTiles: readU64(72),
      tileEntries: readU64(80),
      tileContents: readU64(88)
    },
    encoding: {
      clustered: view.getUint8(96) === 1,
      internalCompression: view.getUint8(97),
      tileCompression: view.getUint8(98),
      tileType: view.getUint8(99)
    },
    zoom: {
      min: view.getUint8(100),
      max: view.getUint8(101),
      center: view.getUint8(118)
    },
    bounds: {
      minLon: toCoord(view.getInt32(102, true)),
      minLat: toCoord(view.getInt32(106, true)),
      maxLon: toCoord(view.getInt32(110, true)),
      maxLat: toCoord(view.getInt32(114, true))
    },
    center: {
      lon: toCoord(view.getInt32(119, true)),
      lat: toCoord(view.getInt32(123, true))
    }
  }
}
