/**
 * Layer Item Component
 * 
 * Individual layer display component with visibility toggle, styling controls,
 * and context menu. Keeps the main LayersPanel clean and focused.
 */

import React, { useState } from 'react'
import { MoreVertical, Eye, EyeOff, Palette, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { LayerDefinition } from '../../../../../shared/types/layer-types'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'

interface LayerItemProps {
  layer: LayerDefinition
  isSelected?: boolean
  onToggleVisibility: (layerId: string, visible: boolean) => void
  onSelect: (layerId: string) => void
  onEdit: (layerId: string) => void
  onDuplicate: (layerId: string) => void
  onDelete: (layerId: string) => void
  onShowStyleEditor: (layerId: string) => void
}

export const LayerItem: React.FC<LayerItemProps> = ({
  layer,
  isSelected,
  onToggleVisibility,
  onSelect,
  onEdit,
  onDuplicate,
  onDelete,
  onShowStyleEditor
}) => {
  const [isHovered, setIsHovered] = useState(false)

  const handleVisibilityToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    onToggleVisibility(layer.id, !layer.visibility)
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.stopPropagation()
    // Context menu is handled by the DropdownMenu
  }

  const getLayerTypeColor = (type: 'raster' | 'vector') => {
    switch (type) {
      case 'raster':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300'
      case 'vector':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300'
    }
  }

  const getGeometryTypeIcon = (geometryType?: string) => {
    switch (geometryType) {
      case 'Point':
      case 'MultiPoint':
        return '●'
      case 'LineString':
      case 'MultiLineString':
        return '—'
      case 'Polygon':
      case 'MultiPolygon':
        return '▢'
      default:
        return null
    }
  }

  return (
    <div
      className={cn(
        'group flex items-center gap-2 p-2 rounded-lg border transition-all cursor-pointer',
        'hover:bg-muted/50 hover:border-border',
        isSelected && 'bg-primary/10 border-primary/50',
        !layer.visibility && 'opacity-60'
      )}
      onClick={() => onSelect(layer.id)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onContextMenu={handleContextMenu}
    >
      {/* Visibility Toggle */}
      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0 shrink-0"
        onClick={handleVisibilityToggle}
      >
        {layer.visibility ? (
          <Eye className="h-3 w-3 text-primary" />
        ) : (
          <EyeOff className="h-3 w-3 text-muted-foreground" />
        )}
      </Button>

      {/* Layer Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">
              {layer.name}
            </div>
            <div className="flex items-center gap-1 mt-0.5">
              <Badge 
                variant="secondary" 
                className={cn('text-xs px-1.5 py-0', getLayerTypeColor(layer.type))}
              >
                {layer.type}
              </Badge>
              {layer.metadata.geometryType && (
                <span className="text-xs text-muted-foreground">
                  {getGeometryTypeIcon(layer.metadata.geometryType)} {layer.metadata.geometryType}
                </span>
              )}
            </div>
          </div>
          
          {/* Layer Status Indicators */}
          <div className="flex items-center gap-1">
            {layer.isLocked && (
              <div className="w-1 h-1 bg-orange-500 rounded-full" title="Layer is locked" />
            )}
            {layer.opacity < 1 && (
              <div className="text-xs text-muted-foreground">
                {Math.round(layer.opacity * 100)}%
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Action Buttons - Show on hover */}
      <div className={cn(
        'flex items-center gap-1 transition-opacity',
        isHovered || isSelected ? 'opacity-100' : 'opacity-0'
      )}>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={(e) => {
            e.stopPropagation()
            onShowStyleEditor(layer.id)
          }}
          title="Edit layer style"
        >
          <Palette className="h-3 w-3" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreVertical className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={(e) => {
              e.stopPropagation()
              onEdit(layer.id)
            }}>
              <Settings className="h-4 w-4 mr-2" />
              Edit Layer
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => {
              e.stopPropagation()
              onDuplicate(layer.id)
            }}>
              Duplicate Layer
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={(e) => {
              e.stopPropagation()
              onShowStyleEditor(layer.id)
            }}>
              <Palette className="h-4 w-4 mr-2" />
              Style Editor
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              onClick={(e) => {
                e.stopPropagation()
                onDelete(layer.id)
              }}
              className="text-destructive focus:text-destructive"
            >
              Delete Layer
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}