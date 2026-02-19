import React, { useState, useCallback, useRef, useEffect } from 'react'

export interface GeocodingResult {
  name: string
  displayName: string
  coordinates: [number, number] // [lng, lat]
  type: string
  bbox?: [number, number, number, number] // [minLng, minLat, maxLng, maxLat]
}

interface PhotonFeature {
  properties: {
    name: string
    country?: string
    city?: string
    state?: string
    street?: string
    housenumber?: string
    osm_value?: string
  }
  geometry: {
    coordinates: [number, number]
  }
  bbox?: [number, number, number, number]
}

interface PhotonResponse {
  features: PhotonFeature[]
}

const PHOTON_API_URL = 'https://photon.komoot.io/api'

export function useGeocodingSearch(): {
  query: string
  setQuery: React.Dispatch<React.SetStateAction<string>>
  results: GeocodingResult[]
  isLoading: boolean
  error: string | null
  clearSearch: () => void
} {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GeocodingResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const buildDisplayName = (properties: PhotonFeature['properties']): string => {
    const parts: string[] = []

    if (properties.name) parts.push(properties.name)
    if (properties.street) {
      const street = properties.housenumber
        ? `${properties.street} ${properties.housenumber}`
        : properties.street
      parts.push(street)
    }
    if (properties.city) parts.push(properties.city)
    if (properties.state) parts.push(properties.state)
    if (properties.country) parts.push(properties.country)

    return parts.join(', ')
  }

  const search = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([])
      setError(null)
      return
    }

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    // Create new abort controller
    abortControllerRef.current = new AbortController()

    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(
        `${PHOTON_API_URL}?q=${encodeURIComponent(searchQuery)}&limit=10`,
        {
          signal: abortControllerRef.current.signal
        }
      )

      if (!response.ok) {
        throw new Error('Failed to fetch geocoding results')
      }

      const data: PhotonResponse = await response.json()

      const geocodingResults: GeocodingResult[] = data.features.map((feature) => ({
        name: feature.properties.name || 'Unknown',
        displayName: buildDisplayName(feature.properties),
        coordinates: feature.geometry.coordinates,
        type: feature.properties.osm_value || 'place',
        bbox: feature.bbox
      }))

      setResults(geocodingResults)
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Request was cancelled, ignore
        return
      }
      setError(err instanceof Error ? err.message : 'An error occurred')
      setResults([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (query) {
        search(query)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [query, search])

  const clearSearch = useCallback(() => {
    setQuery('')
    setResults([])
    setError(null)
  }, [])

  return {
    query,
    setQuery,
    results,
    isLoading,
    error,
    clearSearch
  }
}
