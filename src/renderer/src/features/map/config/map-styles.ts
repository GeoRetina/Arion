import type { StyleSpecification } from 'maplibre-gl'

/**
 * Default OpenStreetMap raster style.
 * Keeping styles isolated makes it easier to swap providers later.
 */
export const osmRasterStyle: StyleSpecification = {
  version: 8,
  sources: {
    'osm-raster-tiles': {
      type: 'raster',
      tiles: [
        'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png'
      ],
      tileSize: 256,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }
  },
  layers: [
    {
      id: 'osm-raster-layer',
      type: 'raster',
      source: 'osm-raster-tiles',
      minzoom: 0,
      maxzoom: 19
    }
  ]
}
