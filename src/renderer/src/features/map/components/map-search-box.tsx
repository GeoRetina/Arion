import React, { useRef, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { MapPin, Loader2, X } from 'lucide-react'
import { useGeocodingSearch, GeocodingResult } from '../hooks/use-geocoding-search'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'

interface MapSearchBoxProps {
  onSelectResult: (result: GeocodingResult) => void
  onClose: () => void
  className?: string
}

export const MapSearchBox: React.FC<MapSearchBoxProps> = ({
  onSelectResult,
  onClose,
  className
}) => {
  const { query, setQuery, results, isLoading, error, clearSearch } = useGeocodingSearch()
  const inputRef = useRef<HTMLInputElement>(null)
  const [selectedIndex, setSelectedIndex] = React.useState(0)

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(0)
  }, [results])

  const handleSelectResult = (result: GeocodingResult) => {
    onSelectResult(result)
    clearSearch()
    onClose()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose()
      return
    }

    if (results.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (results[selectedIndex]) {
        handleSelectResult(results[selectedIndex])
      }
    }
  }

  return (
    <div
      className={cn(
        'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20',
        'w-full max-w-md',
        className
      )}
    >
      <div className="relative">
        <div className="bg-background/95 backdrop-blur-md rounded-lg border border-border shadow-lg">
          {/* Search Input */}
          <div className="relative flex items-center gap-2 p-3">
            <Input
              ref={inputRef}
              type="text"
              placeholder="Search for a location..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 border-none shadow-none focus-visible:ring-0"
            />
            {isLoading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="size-8 shrink-0"
              aria-label="Close search"
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>

        {/* Results List - Positioned absolutely */}
        {query && (
          <div className="absolute top-full left-0 right-0 bg-background/95 backdrop-blur-md rounded-lg border-x border-b border-border shadow-lg overflow-hidden">
            {error && <div className="p-4 text-sm text-destructive text-center">{error}</div>}

            {!error && !isLoading && results.length === 0 && (
              <div className="p-4 text-sm text-muted-foreground text-center">No results found</div>
            )}

            {!error && results.length > 0 && (
              <ScrollArea className="h-[300px]">
                <div className="py-2">
                  {results.map((result, index) => (
                    <button
                      key={`${result.coordinates[0]}-${result.coordinates[1]}-${index}`}
                      onClick={() => handleSelectResult(result)}
                      onMouseEnter={() => setSelectedIndex(index)}
                      className={cn(
                        'w-full px-4 py-3 text-left',
                        'flex items-start gap-3',
                        'transition-colors',
                        'hover:bg-accent hover:text-accent-foreground',
                        selectedIndex === index && 'bg-accent text-accent-foreground'
                      )}
                    >
                      <MapPin className="size-4 mt-0.5 shrink-0 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{result.name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {result.displayName}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
