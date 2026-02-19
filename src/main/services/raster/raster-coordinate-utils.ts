import type { BoundingBox, SupportedRasterCrs } from './raster-types'

const EARTH_RADIUS_METERS = 6378137
const EARTH_CIRCUMFERENCE_METERS = 2 * Math.PI * EARTH_RADIUS_METERS
const ORIGIN_SHIFT_METERS = EARTH_CIRCUMFERENCE_METERS / 2
const MAX_MERCATOR_LATITUDE = 85.0511287798066

export const TILE_SIZE = 256

export function clampLatitude(latitude: number): number {
  return Math.max(-MAX_MERCATOR_LATITUDE, Math.min(MAX_MERCATOR_LATITUDE, latitude))
}

export function tileToLonLatBounds(z: number, x: number, y: number): BoundingBox {
  const n = Math.pow(2, z)
  const west = (x / n) * 360 - 180
  const east = ((x + 1) / n) * 360 - 180
  const north = radiansToDegrees(Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))))
  const south = radiansToDegrees(Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 1)) / n))))

  return [west, south, east, north]
}

export function lonLatToWebMercator(lon: number, lat: number): [number, number] {
  const clampedLat = clampLatitude(lat)
  const x = (lon * ORIGIN_SHIFT_METERS) / 180
  const y =
    (Math.log(Math.tan(((90 + clampedLat) * Math.PI) / 360)) / (Math.PI / 180)) *
    (ORIGIN_SHIFT_METERS / 180)
  return [x, y]
}

export function webMercatorToLonLat(x: number, y: number): [number, number] {
  const lon = (x / ORIGIN_SHIFT_METERS) * 180
  const latDegrees = (y / ORIGIN_SHIFT_METERS) * 180
  const lat =
    (180 / Math.PI) * (2 * Math.atan(Math.exp((latDegrees * Math.PI) / 180)) - Math.PI / 2)

  return [lon, clampLatitude(lat)]
}

export function sourceBoundsToMapBounds(
  sourceBounds: BoundingBox,
  crs: SupportedRasterCrs
): BoundingBox {
  if (crs === 'EPSG:4326') {
    const [west, south, east, north] = sourceBounds
    return [west, clampLatitude(south), east, clampLatitude(north)]
  }

  const [minX, minY, maxX, maxY] = sourceBounds
  const [west, south] = webMercatorToLonLat(minX, minY)
  const [east, north] = webMercatorToLonLat(maxX, maxY)
  return [west, south, east, north]
}

export function mapBoundsToSourceBounds(
  mapBounds: BoundingBox,
  crs: SupportedRasterCrs
): BoundingBox {
  if (crs === 'EPSG:4326') {
    return mapBounds
  }

  const [west, south, east, north] = mapBounds
  const [minX, minY] = lonLatToWebMercator(west, south)
  const [maxX, maxY] = lonLatToWebMercator(east, north)
  return [minX, minY, maxX, maxY]
}

export function intersects(a: BoundingBox, b: BoundingBox): boolean {
  return !(a[2] <= b[0] || a[0] >= b[2] || a[3] <= b[1] || a[1] >= b[3])
}

export function intersection(a: BoundingBox, b: BoundingBox): BoundingBox | null {
  if (!intersects(a, b)) {
    return null
  }

  return [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])]
}

export function validateBoundingBox(bounds: BoundingBox, context: string): BoundingBox {
  const [minX, minY, maxX, maxY] = bounds
  const numeric = bounds.every((value) => Number.isFinite(value))
  if (!numeric) {
    throw new Error(`Invalid ${context} bounding box: values must be finite numbers`)
  }

  if (maxX <= minX || maxY <= minY) {
    throw new Error(`Invalid ${context} bounding box: max values must be larger than min values`)
  }

  return [minX, minY, maxX, maxY]
}

export function inferNativeMaxZoom(
  sourceBounds: BoundingBox,
  width: number,
  crs: SupportedRasterCrs
): number {
  if (!Number.isFinite(width) || width <= 0) {
    return 22
  }

  const spanX = sourceBounds[2] - sourceBounds[0]
  if (!Number.isFinite(spanX) || spanX <= 0) {
    return 22
  }

  const pixelSize = spanX / width
  const worldSpan = crs === 'EPSG:4326' ? 360 : EARTH_CIRCUMFERENCE_METERS
  const zoom = Math.log2(worldSpan / (pixelSize * TILE_SIZE))

  if (!Number.isFinite(zoom)) {
    return 22
  }

  return Math.max(0, Math.min(24, Math.ceil(zoom)))
}

function radiansToDegrees(value: number): number {
  return (value * 180) / Math.PI
}
