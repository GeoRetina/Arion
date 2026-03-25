import type { StyleSpecification } from 'maplibre-gl'

export interface BasemapDefinition {
  id: string
  name: string
  style: StyleSpecification
  /** A single tile URL used as a visual thumbnail preview */
  thumbnail: string
}

function createRasterStyle(
  sourceId: string,
  tiles: string[],
  attribution: string,
  tileSize = 256,
  maxzoom = 19
): StyleSpecification {
  return {
    version: 8,
    sources: {
      [sourceId]: {
        type: 'raster',
        tiles,
        tileSize,
        attribution
      }
    },
    layers: [
      {
        id: `${sourceId}-layer`,
        type: 'raster',
        source: sourceId,
        minzoom: 0,
        maxzoom
      }
    ]
  }
}

const osmAttribution =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
const cartoAttribution =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
const topoAttribution =
  'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)'

// Thumbnail tile: z=3, x=4, y=2 (Western Europe)
export const basemaps: BasemapDefinition[] = [
  {
    id: 'osm-standard',
    name: 'Standard',
    thumbnail: 'https://a.tile.openstreetmap.org/3/4/2.png',
    style: createRasterStyle(
      'osm-raster-tiles',
      [
        'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png'
      ],
      osmAttribution
    )
  },
  {
    id: 'carto-voyager',
    name: 'Voyager',
    thumbnail: 'https://basemaps.cartocdn.com/rastertiles/voyager/3/4/2.png',
    style: createRasterStyle(
      'carto-voyager-tiles',
      ['https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png'],
      cartoAttribution
    )
  },
  {
    id: 'carto-positron',
    name: 'Positron',
    thumbnail: 'https://basemaps.cartocdn.com/light_all/3/4/2.png',
    style: createRasterStyle(
      'carto-positron-tiles',
      ['https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png'],
      cartoAttribution
    )
  },
  {
    id: 'carto-dark-matter',
    name: 'Dark',
    thumbnail: 'https://basemaps.cartocdn.com/dark_all/3/4/2.png',
    style: createRasterStyle(
      'carto-dark-tiles',
      ['https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'],
      cartoAttribution
    )
  },
  {
    id: 'opentopomap',
    name: 'Topographic',
    thumbnail: 'https://a.tile.opentopomap.org/3/4/2.png',
    style: createRasterStyle(
      'opentopomap-tiles',
      [
        'https://a.tile.opentopomap.org/{z}/{x}/{y}.png',
        'https://b.tile.opentopomap.org/{z}/{x}/{y}.png',
        'https://c.tile.opentopomap.org/{z}/{x}/{y}.png'
      ],
      topoAttribution
    )
  }
]

export const DEFAULT_BASEMAP_ID = 'osm-standard'

/** @deprecated Use `basemaps[0].style` or look up by ID instead */
export const osmRasterStyle = basemaps[0].style
