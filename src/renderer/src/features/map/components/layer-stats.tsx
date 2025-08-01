/**
 * Layer Stats Component
 * 
 * Displays summary statistics and information about layers,
 * including counts, types, and performance metrics.
 */

import React from 'react'
import { BarChart3, Eye, EyeOff, Database, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import type { LayerDefinition, LayerGroup } from '../../../../../shared/types/layer-types'

interface LayerStatsProps {
  layers: LayerDefinition[]
  groups: LayerGroup[]
  selectedLayerId?: string | null
  className?: string
}

interface LayerSummary {
  total: number
  visible: number
  byType: Record<string, number>
  byOrigin: Record<string, number>
  byGroup: Record<string, number>
  hasErrors: number
}

export const LayerStats: React.FC<LayerStatsProps> = ({
  layers,
  groups,
  selectedLayerId,
  className
}) => {
  const summary = React.useMemo((): LayerSummary => {
    const summary: LayerSummary = {
      total: layers.length,
      visible: 0,
      byType: {},
      byOrigin: {},
      byGroup: {},
      hasErrors: 0
    }

    for (const layer of layers) {
      // Count visible layers
      if (layer.visibility) summary.visible++
      
      // Count by type
      summary.byType[layer.type] = (summary.byType[layer.type] || 0) + 1
      
      // Count by origin
      summary.byOrigin[layer.createdBy] = (summary.byOrigin[layer.createdBy] || 0) + 1
      
      // Count by group
      const groupKey = layer.groupId || 'ungrouped'
      summary.byGroup[groupKey] = (summary.byGroup[groupKey] || 0) + 1
    }

    return summary
  }, [layers])

  const selectedLayer = selectedLayerId ? layers.find(l => l.id === selectedLayerId) : null

  if (layers.length === 0) {
    return (
      <div className={cn('p-3 text-center text-muted-foreground', className)}>
        <Database className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <div className="text-sm">No layers loaded</div>
        <div className="text-xs mt-1">
          Import data or use tools to create layers
        </div>
      </div>
    )
  }

  return (
    <div className={cn('p-3 space-y-3', className)}>
      {/* Overall Summary */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Layer Summary</span>
        </div>
        <Badge variant="outline" className="text-xs">
          {summary.total} total
        </Badge>
      </div>

      {/* Visibility Stats */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <Eye className="h-3 w-3 text-primary" />
          <span className="text-muted-foreground">Visible</span>
        </div>
        <span className="font-medium">{summary.visible}</span>
      </div>

      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <EyeOff className="h-3 w-3 text-muted-foreground" />
          <span className="text-muted-foreground">Hidden</span>
        </div>
        <span className="font-medium">{summary.total - summary.visible}</span>
      </div>

      {/* Type Breakdown */}
      {Object.keys(summary.byType).length > 0 && (
        <>
          <div className="border-t pt-3">
            <div className="text-xs font-medium text-muted-foreground mb-2">
              By Type
            </div>
            <div className="space-y-1">
              {Object.entries(summary.byType).map(([type, count]) => (
                <div key={type} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Badge 
                      variant="secondary" 
                      className={cn(
                        'text-xs px-1.5 py-0',
                        type === 'raster' && 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
                        type === 'vector' && 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
                      )}
                    >
                      {type}
                    </Badge>
                  </div>
                  <span className="font-medium">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Origin Breakdown */}
      {Object.keys(summary.byOrigin).length > 0 && (
        <>
          <div className="border-t pt-3">
            <div className="text-xs font-medium text-muted-foreground mb-2">
              By Origin
            </div>
            <div className="space-y-1">
              {Object.entries(summary.byOrigin).map(([origin, count]) => (
                <div key={origin} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground capitalize">{origin}</span>
                  </div>
                  <span className="font-medium">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Groups Info */}
      {groups.length > 0 && (
        <>
          <div className="border-t pt-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Groups</span>
              <span className="font-medium">{groups.length}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Ungrouped</span>
              <span className="font-medium">{summary.byGroup.ungrouped || 0}</span>
            </div>
          </div>
        </>
      )}

      {/* Selected Layer Info */}
      {selectedLayer && (
        <>
          <div className="border-t pt-3">
            <div className="text-xs font-medium text-muted-foreground mb-2">
              Selected Layer
            </div>
            <div className="space-y-1">
              <div className="text-sm font-medium truncate">
                {selectedLayer.name}
              </div>
              <div className="flex items-center gap-2">
                <Badge 
                  variant="secondary" 
                  className={cn(
                    'text-xs px-1.5 py-0',
                    selectedLayer.type === 'raster' && 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
                    selectedLayer.type === 'vector' && 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
                  )}
                >
                  {selectedLayer.type}
                </Badge>
                {selectedLayer.metadata.geometryType && (
                  <Badge variant="outline" className="text-xs px-1.5 py-0">
                    {selectedLayer.metadata.geometryType}
                  </Badge>
                )}
              </div>
              
              {/* Layer Properties */}
              <div className="space-y-0.5 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>Opacity:</span>
                  <span>{Math.round(selectedLayer.opacity * 100)}%</span>
                </div>
                <div className="flex justify-between">
                  <span>Z-Index:</span>
                  <span>{selectedLayer.zIndex}</span>
                </div>
                {selectedLayer.metadata.featureCount && (
                  <div className="flex justify-between">
                    <span>Features:</span>
                    <span>{selectedLayer.metadata.featureCount.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Created:</span>
                  <span title={selectedLayer.createdAt.toLocaleString()}>
                    <Clock className="h-3 w-3 inline mr-1" />
                    {formatRelativeTime(selectedLayer.createdAt)}
                  </span>
                </div>
              </div>

              {/* Layer Tags */}
              {selectedLayer.metadata.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {selectedLayer.metadata.tags.slice(0, 3).map(tag => (
                    <Badge key={tag} variant="outline" className="text-xs px-1.5 py-0">
                      {tag}
                    </Badge>
                  ))}
                  {selectedLayer.metadata.tags.length > 3 && (
                    <Badge variant="outline" className="text-xs px-1.5 py-0">
                      +{selectedLayer.metadata.tags.length - 3}
                    </Badge>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// Helper function to format relative time
function formatRelativeTime(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMinutes = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMinutes < 1) return 'now'
  if (diffMinutes < 60) return `${diffMinutes}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  
  return date.toLocaleDateString()
}