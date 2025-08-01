/**
 * Layers Database Modal
 * 
 * Modal dialog that displays all available layers in the system database.
 * Users can browse, search, and import layers to their current chat session.
 */

import React, { useState, useEffect } from 'react'
import { 
  Search, 
  Download, 
  Eye, 
  EyeOff, 
  Database, 
  Layers3 as Layer3, 
  Filter, 
  Grid, 
  List,
  MapPin,
  Image as ImageIcon,
  Square as Polygon
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useLayerStore } from '@/stores/layer-store'
import { useChatHistoryStore } from '@/stores/chat-history-store'
import { canZoomToLayer } from '@/lib/layer-zoom-utils'
import { toast } from 'sonner'
import type { LayerDefinition, LayerType } from '../../../../../shared/types/layer-types'

interface LayersDatabaseModalProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
}

type ViewMode = 'grid' | 'list'
type FilterType = 'all' | 'vector' | 'raster'

const LayerTypeIcon = ({ type, geometryType }: { type: LayerType; geometryType?: string }) => {
  if (type === 'raster') {
    return <ImageIcon className="h-4 w-4" />
  }
  
  // Vector types
  switch (geometryType) {
    case 'Point':
    case 'MultiPoint':
      return <MapPin className="h-4 w-4" />
    case 'Polygon':
    case 'MultiPolygon':
      return <Polygon className="h-4 w-4" />
    default:
      return <Layer3 className="h-4 w-4" />
  }
}

const LayerCard = ({ 
  layer, 
  viewMode, 
  onImport 
}: { 
  layer: LayerDefinition
  viewMode: ViewMode
  onImport: (layer: LayerDefinition) => void 
}) => {
  const [isImporting, setIsImporting] = useState(false)
  const canZoom = canZoomToLayer(layer)

  const handleImport = async () => {
    setIsImporting(true)
    try {
      await onImport(layer)
    } finally {
      setIsImporting(false)
    }
  }

  const getLayerTypeColor = (type: LayerType) => {
    switch (type) {
      case 'raster':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300'
      case 'vector':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300'
    }
  }

  if (viewMode === 'list') {
    return (
      <div className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <LayerTypeIcon type={layer.type} geometryType={layer.metadata.geometryType} />
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate">{layer.name}</div>
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <Badge variant="secondary" className={cn('text-xs px-1.5 py-0', getLayerTypeColor(layer.type))}>
                {layer.type}
              </Badge>
              {layer.metadata.geometryType && (
                <span className="text-xs">{layer.metadata.geometryType}</span>
              )}
              {layer.metadata.featureCount && (
                <span className="text-xs">{layer.metadata.featureCount.toLocaleString()} features</span>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            title={layer.visibility ? 'Layer visible' : 'Layer hidden'}
            disabled
          >
            {layer.visibility ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3 opacity-50" />}
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-3"
            onClick={handleImport}
            disabled={isImporting}
          >
            <Download className="h-3 w-3 mr-1" />
            {isImporting ? 'Importing...' : 'Import'}
          </Button>
        </div>
      </div>
    )
  }

  // Grid view
  return (
    <div className="border rounded-lg p-4 hover:bg-muted/50 transition-colors space-y-3">
      <div className="flex items-start gap-2">
        <LayerTypeIcon type={layer.type} geometryType={layer.metadata.geometryType} />
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{layer.name}</div>
          <div className="text-sm text-muted-foreground mt-1">
            <Badge variant="secondary" className={cn('text-xs px-1.5 py-0', getLayerTypeColor(layer.type))}>
              {layer.type}
            </Badge>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 shrink-0"
          title={layer.visibility ? 'Layer visible' : 'Layer hidden'}
          disabled
        >
          {layer.visibility ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3 opacity-50" />}
        </Button>
      </div>

      <div className="space-y-1 text-sm text-muted-foreground">
        {layer.metadata.geometryType && (
          <div className="flex items-center gap-1">
            <span className="w-16 shrink-0">Type:</span>
            <span>{layer.metadata.geometryType}</span>
          </div>
        )}
        {layer.metadata.featureCount && (
          <div className="flex items-center gap-1">
            <span className="w-16 shrink-0">Features:</span>
            <span>{layer.metadata.featureCount.toLocaleString()}</span>
          </div>
        )}
        {canZoom && (
          <div className="flex items-center gap-1">
            <span className="w-16 shrink-0">Extent:</span>
            <span className="text-green-600 dark:text-green-400 text-xs">Available</span>
          </div>
        )}
      </div>

      <Button
        variant="outline"
        size="sm"
        className="w-full"
        onClick={handleImport}
        disabled={isImporting}
      >
        <Download className="h-3 w-3 mr-2" />
        {isImporting ? 'Importing...' : 'Import to Chat'}
      </Button>
    </div>
  )
}

export const LayersDatabaseModal: React.FC<LayersDatabaseModalProps> = ({
  isOpen,
  onOpenChange
}) => {
  const { layers, addLayer, addError, loadFromPersistence, isLoading } = useLayerStore()
  const currentChatId = useChatHistoryStore((state) => state.currentChatId)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState<FilterType>('all')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [hasLoadedOnOpen, setHasLoadedOnOpen] = useState(false)

  // Load layers from persistence when modal opens
  useEffect(() => {
    if (isOpen && !hasLoadedOnOpen) {
      console.log('[LayersDatabaseModal] Modal opened, loading layers from persistence')
      console.log('[LayersDatabaseModal] Current layers in store:', layers.size)
      loadFromPersistence()
        .then(() => {
          console.log('[LayersDatabaseModal] Layers loaded from persistence, count:', layers.size)
          setHasLoadedOnOpen(true)
        })
        .catch(error => {
          console.error('[LayersDatabaseModal] Failed to load layers:', error)
          // Still mark as loaded to prevent repeated attempts
          setHasLoadedOnOpen(true)
        })
    }
    
    // Reset loaded flag when modal closes
    if (!isOpen && hasLoadedOnOpen) {
      setHasLoadedOnOpen(false)
    }
  }, [isOpen, hasLoadedOnOpen, loadFromPersistence, layers.size])
  
  // Get database layers only (exclude session-imported layers)
  const databaseLayers = Array.from(layers.values()).filter(layer => 
    layer.createdBy !== 'import' // Exclude layers imported to sessions
  )
  
  // Filter layers based on search and filter type
  const filteredLayers = databaseLayers.filter(layer => {
    const matchesSearch = !searchQuery || layer.name.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesFilter = filterType === 'all' || layer.type === filterType
    return matchesSearch && matchesFilter
  })

  const handleImportLayer = async (layer: LayerDefinition) => {
    try {
      // Only allow import if there's a current chat session
      if (!currentChatId) {
        console.warn('[LayersDatabaseModal] Cannot import layer: no active chat session')
        return
      }

      // Create a copy of the layer with a new ID for the chat session
      const importedLayer: Omit<LayerDefinition, 'id' | 'createdAt' | 'updatedAt'> = {
        name: `${layer.name} (Chat Session)`,
        type: layer.type,
        sourceId: `${layer.sourceId}-session-${currentChatId}`, // Make source unique per session
        sourceConfig: {
          ...layer.sourceConfig
        },
        style: layer.style,
        visibility: true,
        opacity: layer.opacity,
        zIndex: layer.zIndex,
        metadata: {
          ...layer.metadata,
          description: `${layer.metadata.description || ''} [Session: ${currentChatId}]`.trim()
        },
        groupId: layer.groupId,
        isLocked: false,
        createdBy: 'import'
      }

      await addLayer(importedLayer, {
        chatId: currentChatId,
        source: 'database-import',
        metadata: {
          originalLayerId: layer.id,
          originalName: layer.name
        }
      })
      
      toast.success(`Layer "${layer.name}" imported to chat`, {
        description: 'Added to current session'
      })
      console.log('[LayersDatabaseModal] Successfully imported layer:', layer.name)
    } catch (error) {
      console.error('[LayersDatabaseModal] Failed to import layer:', error)
      
      toast.error('Failed to import layer from database', {
        description: error instanceof Error ? error.message : 'An unknown error occurred'
      })
      
      addError({
        code: 'INVALID_LAYER_DATA',
        message: `Failed to import layer: ${layer.name}`,
        details: { originalLayerId: layer.id },
        timestamp: new Date()
      })
    }
  }

  const stats = {
    total: databaseLayers.length,
    vector: databaseLayers.filter(l => l.type === 'vector').length,
    raster: databaseLayers.filter(l => l.type === 'raster').length,
    visible: databaseLayers.filter(l => l.visibility).length
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Layer Database
          </DialogTitle>
          <DialogDescription>
            Browse and import layers from your database into the current chat session.
          </DialogDescription>
        </DialogHeader>

        {/* Stats Bar */}
        <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-2 text-sm">
            <Layer3 className="h-4 w-4" />
            <span className="font-medium">{stats.total}</span>
            <span className="text-muted-foreground">total layers</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <div className="w-2 h-2 bg-green-500 rounded-full" />
            <span className="font-medium">{stats.vector}</span>
            <span className="text-muted-foreground">vector</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <div className="w-2 h-2 bg-blue-500 rounded-full" />
            <span className="font-medium">{stats.raster}</span>
            <span className="text-muted-foreground">raster</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Eye className="h-4 w-4" />
            <span className="font-medium">{stats.visible}</span>
            <span className="text-muted-foreground">visible</span>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search layers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          
          <Select value={filterType} onValueChange={(value: FilterType) => setFilterType(value)}>
            <SelectTrigger className="w-32">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="vector">Vector</SelectItem>
              <SelectItem value="raster">Raster</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center border rounded-lg">
            <Button
              variant={viewMode === 'grid' ? 'default' : 'ghost'}
              size="sm"
              className="h-9 px-3 rounded-r-none border-r"
              onClick={() => setViewMode('grid')}
            >
              <Grid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              className="h-9 px-3 rounded-l-none"
              onClick={() => setViewMode('list')}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Layers Grid/List */}
        <ScrollArea className="flex-1">
          {isLoading && !hasLoadedOnOpen ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Database className="h-12 w-12 text-muted-foreground/50 mb-4 animate-pulse" />
              <div className="text-lg font-medium mb-2">Loading layers...</div>
              <div className="text-muted-foreground">
                Please wait while we load your layer database
              </div>
            </div>
          ) : filteredLayers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Database className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <div className="text-lg font-medium mb-2">
                {searchQuery || filterType !== 'all' ? 'No layers match your criteria' : 'No layers in database'}
              </div>
              <div className="text-muted-foreground">
                {searchQuery || filterType !== 'all' 
                  ? 'Try adjusting your search or filter settings'
                  : 'Import some layers using the + button in the chat input to see them here'
                }
              </div>
              {!searchQuery && filterType === 'all' && (
                <div className="text-xs text-muted-foreground mt-2 opacity-75">
                  Debug: Database layers: {databaseLayers.length} | Loaded: {hasLoadedOnOpen ? 'Yes' : 'No'}
                </div>
              )}
            </div>
          ) : (
            <div className={cn(
              'p-2',
              viewMode === 'grid' 
                ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'
                : 'space-y-2'
            )}>
              {filteredLayers.map((layer) => (
                <LayerCard
                  key={layer.id}
                  layer={layer}
                  viewMode={viewMode}
                  onImport={handleImportLayer}
                />
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Results count */}
        {filteredLayers.length > 0 && (
          <div className="text-sm text-muted-foreground text-center py-2">
            Showing {filteredLayers.length} of {databaseLayers.length} database layers
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}