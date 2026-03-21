import type { RasterRgbBandSelection } from '../types/layer-types'

const RGB_BAND_QUERY_PARAM = 'rgb'

export function buildRasterTileUrlWithRgbBandSelection(
  tileUrlTemplate: string,
  selection?: RasterRgbBandSelection | null
): string {
  const [baseUrl, queryString] = splitTileUrl(tileUrlTemplate)
  const searchParams = new URLSearchParams(queryString)
  searchParams.delete(RGB_BAND_QUERY_PARAM)

  if (selection) {
    searchParams.set(RGB_BAND_QUERY_PARAM, serializeRasterRgbBandSelection(selection))
  }

  const nextQuery = searchParams.toString()
  return nextQuery.length > 0 ? `${baseUrl}?${nextQuery}` : baseUrl
}

export function stripRasterRgbBandSelectionFromTileUrl(tileUrlTemplate: string): string {
  return buildRasterTileUrlWithRgbBandSelection(tileUrlTemplate, null)
}

export function parseRasterRgbBandSelectionFromTileUrl(
  tileUrlTemplate: string
): RasterRgbBandSelection | null {
  const [, queryString] = splitTileUrl(tileUrlTemplate)
  const selectionValue = new URLSearchParams(queryString).get(RGB_BAND_QUERY_PARAM)
  return parseRasterRgbBandSelection(selectionValue)
}

export function parseRasterRgbBandSelection(
  value: string | null | undefined
): RasterRgbBandSelection | null {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null
  }

  const parts = value.split(',').map((part) => Number.parseInt(part.trim(), 10))

  if (parts.length !== 3 || parts.some((part) => !isValidRasterBandNumber(part))) {
    return null
  }

  return {
    red: parts[0],
    green: parts[1],
    blue: parts[2]
  }
}

export function serializeRasterRgbBandSelection(selection: RasterRgbBandSelection): string {
  return `${selection.red},${selection.green},${selection.blue}`
}

export function areRasterRgbBandSelectionsEqual(
  left: RasterRgbBandSelection | null | undefined,
  right: RasterRgbBandSelection | null | undefined
): boolean {
  if (!left && !right) {
    return true
  }

  if (!left || !right) {
    return false
  }

  return left.red === right.red && left.green === right.green && left.blue === right.blue
}

function splitTileUrl(tileUrlTemplate: string): [string, string] {
  const queryIndex = tileUrlTemplate.indexOf('?')
  if (queryIndex < 0) {
    return [tileUrlTemplate, '']
  }

  return [tileUrlTemplate.slice(0, queryIndex), tileUrlTemplate.slice(queryIndex + 1)]
}

function isValidRasterBandNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}
