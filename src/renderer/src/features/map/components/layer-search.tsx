/**
 * Layer Search Component
 *
 * Provides search and filtering capabilities for layers with advanced
 * search syntax support and filter options.
 */

import React, { useState, useCallback } from 'react'
import { Search, X, Filter, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import type { LayerSearchCriteria } from '../../../../../shared/types/layer-types'

interface LayerSearchProps {
  searchCriteria: LayerSearchCriteria
  onSearchChange: (criteria: LayerSearchCriteria) => void
  onClearSearch: () => void
  className?: string
}

const LAYER_TYPES = [
  { value: 'raster', label: 'Raster' },
  { value: 'vector', label: 'Vector' }
] as const

const LAYER_ORIGINS = [
  { value: 'user', label: 'User Created' },
  { value: 'tool', label: 'Tool Generated' },
  { value: 'mcp', label: 'MCP Server' },
  { value: 'import', label: 'Imported' }
] as const

export const LayerSearch: React.FC<LayerSearchProps> = ({
  searchCriteria,
  onSearchChange,
  onClearSearch,
  className
}) => {
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [searchInput, setSearchInput] = useState(searchCriteria.query || '')

  const handleSearchInputChange = useCallback(
    (value: string) => {
      setSearchInput(value)
      onSearchChange({
        ...searchCriteria,
        query: value.trim() || undefined
      })
    },
    [searchCriteria, onSearchChange]
  )

  const handleTypeToggle = useCallback(
    (type: 'raster' | 'vector') => {
      onSearchChange({
        ...searchCriteria,
        type: searchCriteria.type === type ? undefined : type
      })
    },
    [searchCriteria, onSearchChange]
  )

  const handleOriginToggle = useCallback(
    (origin: 'user' | 'tool' | 'mcp' | 'import') => {
      onSearchChange({
        ...searchCriteria,
        createdBy: searchCriteria.createdBy === origin ? undefined : origin
      })
    },
    [searchCriteria, onSearchChange]
  )

  const handleGeometryFilterToggle = useCallback(() => {
    onSearchChange({
      ...searchCriteria,
      hasGeometry: searchCriteria.hasGeometry === true ? undefined : true
    })
  }, [searchCriteria, onSearchChange])

  const handleClearAll = useCallback(() => {
    setSearchInput('')
    onClearSearch()
  }, [onClearSearch])

  const hasActiveFilters = !!(
    searchCriteria.query ||
    searchCriteria.type ||
    searchCriteria.createdBy ||
    searchCriteria.hasGeometry !== undefined ||
    searchCriteria.tags?.length ||
    searchCriteria.groupId ||
    searchCriteria.dateRange
  )

  const activeFilterCount = [
    searchCriteria.type,
    searchCriteria.createdBy,
    searchCriteria.hasGeometry !== undefined,
    searchCriteria.tags?.length,
    searchCriteria.groupId,
    searchCriteria.dateRange
  ].filter(Boolean).length

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 text-muted-foreground transform -translate-y-1/2" />
        <Input
          placeholder="Search layers... (e.g., type:vector tag:roads)"
          value={searchInput}
          onChange={(e) => handleSearchInputChange(e.target.value)}
          className="pl-9 pr-20"
        />
        <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center gap-1">
          {/* Filter Button */}
          <DropdownMenu open={isFilterOpen} onOpenChange={setIsFilterOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn('h-6 px-2 relative', hasActiveFilters && 'text-primary')}
              >
                <Filter className="h-3 w-3" />
                {activeFilterCount > 0 && (
                  <Badge
                    variant="secondary"
                    className="absolute -top-1 -right-1 h-4 w-4 p-0 text-xs flex items-center justify-center"
                  >
                    {activeFilterCount}
                  </Badge>
                )}
                <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Filter Layers</DropdownMenuLabel>
              <DropdownMenuSeparator />

              {/* Layer Type Filter */}
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                Layer Type
              </DropdownMenuLabel>
              {LAYER_TYPES.map((type) => (
                <DropdownMenuCheckboxItem
                  key={type.value}
                  checked={searchCriteria.type === type.value}
                  onCheckedChange={() => handleTypeToggle(type.value)}
                >
                  {type.label}
                </DropdownMenuCheckboxItem>
              ))}

              <DropdownMenuSeparator />

              {/* Origin Filter */}
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                Created By
              </DropdownMenuLabel>
              {LAYER_ORIGINS.map((origin) => (
                <DropdownMenuCheckboxItem
                  key={origin.value}
                  checked={searchCriteria.createdBy === origin.value}
                  onCheckedChange={() => handleOriginToggle(origin.value)}
                >
                  {origin.label}
                </DropdownMenuCheckboxItem>
              ))}

              <DropdownMenuSeparator />

              {/* Other Filters */}
              <DropdownMenuCheckboxItem
                checked={searchCriteria.hasGeometry === true}
                onCheckedChange={handleGeometryFilterToggle}
              >
                Has Geometry Data
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Clear Button */}
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={handleClearAll}
              title="Clear all filters"
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      {/* Active Filter Tags */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-1">
          {searchCriteria.type && (
            <Badge
              variant="secondary"
              className="text-xs cursor-pointer hover:bg-secondary/80"
              onClick={() => handleTypeToggle(searchCriteria.type!)}
            >
              Type: {searchCriteria.type}
              <X className="h-3 w-3 ml-1" />
            </Badge>
          )}
          {searchCriteria.createdBy && (
            <Badge
              variant="secondary"
              className="text-xs cursor-pointer hover:bg-secondary/80"
              onClick={() => handleOriginToggle(searchCriteria.createdBy!)}
            >
              Origin: {searchCriteria.createdBy}
              <X className="h-3 w-3 ml-1" />
            </Badge>
          )}
          {searchCriteria.hasGeometry === true && (
            <Badge
              variant="secondary"
              className="text-xs cursor-pointer hover:bg-secondary/80"
              onClick={handleGeometryFilterToggle}
            >
              Has Geometry
              <X className="h-3 w-3 ml-1" />
            </Badge>
          )}
          {searchCriteria.tags?.map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              className="text-xs cursor-pointer hover:bg-secondary/80"
              onClick={() =>
                onSearchChange({
                  ...searchCriteria,
                  tags: searchCriteria.tags?.filter((t) => t !== tag)
                })
              }
            >
              Tag: {tag}
              <X className="h-3 w-3 ml-1" />
            </Badge>
          ))}
        </div>
      )}

      {/* Search Syntax Help */}
      {searchInput.length > 0 && (
        <div className="text-xs text-muted-foreground">
          <div>
            Search syntax: <code>type:vector</code>, <code>tag:roads</code>,{' '}
            <code>createdBy:user</code>
          </div>
        </div>
      )}
    </div>
  )
}
