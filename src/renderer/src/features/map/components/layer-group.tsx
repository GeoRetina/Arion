/**
 * Layer Group Component
 *
 * Handles display and management of layer groups with expand/collapse,
 * group-level operations, and nested layer display.
 */

import React, { useState } from 'react'
import { ChevronDown, ChevronRight, FolderOpen, Folder, MoreVertical, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import type {
  LayerGroup as LayerGroupType,
  LayerDefinition
} from '../../../../../shared/types/layer-types'
import { LayerItem } from './layer-item'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'

interface LayerGroupProps {
  group: LayerGroupType
  layers: LayerDefinition[]
  selectedLayerId?: string | null
  level?: number
  onToggleGroup: (groupId: string) => void
  onSelectLayer: (layerId: string) => void
  onToggleLayerVisibility: (layerId: string, visible: boolean) => void
  onDeleteLayer: (layerId: string) => void
  onShowStyleEditor: (layerId: string) => void
  onZoomToLayer: (layerId: string) => void
  onEditGroup: (groupId: string) => void
  onDeleteGroup: (groupId: string) => void
  onAddLayerToGroup: (groupId: string) => void
}

export const LayerGroup: React.FC<LayerGroupProps> = ({
  group,
  layers,
  selectedLayerId,
  level = 0,
  onToggleGroup,
  onSelectLayer,
  onToggleLayerVisibility,
  onDeleteLayer,
  onShowStyleEditor,
  onZoomToLayer,
  onEditGroup,
  onDeleteGroup,
  onAddLayerToGroup
}) => {
  const [isHovered, setIsHovered] = useState(false)

  const groupLayers = layers.filter((layer) => layer.groupId === group.id)
  const visibleLayersCount = groupLayers.filter((layer) => layer.visibility).length

  const handleToggleExpanded = () => {
    onToggleGroup(group.id)
  }

  const handleGroupVisibilityToggle = () => {
    // Toggle visibility of all layers in the group
    const newVisibility = visibleLayersCount === 0
    groupLayers.forEach((layer) => {
      if (layer.visibility !== newVisibility) {
        onToggleLayerVisibility(layer.id, newVisibility)
      }
    })
  }

  return (
    <div
      className={cn('border border-transparent rounded-lg', level === 0 && 'mb-2')}
      style={{ marginLeft: level * 12 }}
    >
      {/* Group Header */}
      <div
        className={cn(
          'group grid grid-cols-[auto_auto_1fr_auto] gap-2 p-2 rounded-lg transition-all items-center',
          'hover:bg-muted/30 cursor-pointer',
          group.color && 'border-l-4',
          isHovered && 'bg-muted/20'
        )}
        style={{
          borderLeftColor: group.color || undefined
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Expand/Collapse Toggle */}
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 shrink-0"
          onClick={(e) => {
            e.stopPropagation()
            handleToggleExpanded()
          }}
        >
          {group.expanded ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
        </Button>

        {/* Group Icon and Visibility */}
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 shrink-0"
          onClick={(e) => {
            e.stopPropagation()
            handleGroupVisibilityToggle()
          }}
        >
          {group.expanded ? (
            <FolderOpen
              className={cn(
                'h-3 w-3',
                visibleLayersCount > 0 ? 'text-primary' : 'text-muted-foreground'
              )}
            />
          ) : (
            <Folder
              className={cn(
                'h-3 w-3',
                visibleLayersCount > 0 ? 'text-primary' : 'text-muted-foreground'
              )}
            />
          )}
        </Button>

        {/* Group Info */}
        <div className="min-w-0 cursor-pointer" onClick={handleToggleExpanded}>
          <div className="text-sm font-medium truncate mb-1">{group.name}</div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-xs px-1.5 py-0">
              {groupLayers.length}
            </Badge>
            {visibleLayersCount > 0 && visibleLayersCount < groupLayers.length && (
              <Badge variant="secondary" className="text-xs px-1.5 py-0">
                {visibleLayersCount} visible
              </Badge>
            )}
            {group.description && (
              <span className="text-xs text-muted-foreground truncate">{group.description}</span>
            )}
          </div>
        </div>

        {/* Group Actions - Show on hover */}
        <div
          className={cn(
            'flex items-center gap-1 transition-opacity justify-end',
            isHovered ? 'opacity-100' : 'opacity-0'
          )}
        >
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={(e) => {
              e.stopPropagation()
              onAddLayerToGroup(group.id)
            }}
            title="Add layer to group"
          >
            <Plus className="h-3 w-3" />
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
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  onEditGroup(group.id)
                }}
              >
                Edit Group
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  onAddLayerToGroup(group.id)
                }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Layer
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  handleGroupVisibilityToggle()
                }}
              >
                {visibleLayersCount === groupLayers.length ? 'Hide All Layers' : 'Show All Layers'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  onDeleteGroup(group.id)
                }}
                className="text-destructive focus:text-destructive"
              >
                Delete Group
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Group Layers - Show when expanded */}
      {group.expanded && (
        <div className="ml-6 mt-1 space-y-1">
          {groupLayers.length === 0 ? (
            <div className="text-xs text-muted-foreground p-2 text-center">
              No layers in this group
            </div>
          ) : (
            groupLayers
              .sort((a, b) => b.zIndex - a.zIndex) // Sort by z-index, highest first
              .map((layer) => (
                <LayerItem
                  key={layer.id}
                  layer={layer}
                  isSelected={selectedLayerId === layer.id}
                  onToggleVisibility={onToggleLayerVisibility}
                  onSelect={onSelectLayer}
                  onDelete={onDeleteLayer}
                  onShowStyleEditor={onShowStyleEditor}
                  onZoomToLayer={onZoomToLayer}
                />
              ))
          )}
        </div>
      )}
    </div>
  )
}
