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
  Database,
  Layers3 as Layer3,
  Filter,
  Grid,
  List,
  Image as ImageIcon,
  Trash2,
  CheckSquare,
  Square
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
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
  SelectValue
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useLayerStore } from '@/stores/layer-store'
import { useChatHistoryStore } from '@/stores/chat-history-store'
import { toast } from 'sonner'
import type { LayerDefinition, LayerType } from '../../../../../shared/types/layer-types'
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog'

interface LayersDatabaseModalProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
}

interface LayerCardProps {
  layer: LayerDefinition
  viewMode: ViewMode
  isSelected: boolean
  onImport: (layer: LayerDefinition) => void
  onToggleSelect: (layerId: string) => void
}

type ViewMode = 'grid' | 'list'
type FilterType = 'all' | 'vector' | 'raster'

const LayerTypeIcon = ({ type }: { type: LayerType }) => {
  if (type === 'raster') {
    return <ImageIcon className="h-4 w-4" />
  }

  // Vector types - no icon, return null
  return null
}

const LayerCard = ({ layer, viewMode, isSelected, onImport, onToggleSelect }: LayerCardProps) => {
  const [isImporting, setIsImporting] = useState(false)

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
      <div
        className={`flex items-center gap-2 sm:gap-3 p-2 sm:p-3 border rounded-lg hover:bg-muted/50 transition-colors ${isSelected ? 'bg-accent/10 border-accent/30 dark:bg-accent/10 dark:border-accent/30' : ''}`}
      >
        <button
          onClick={() => onToggleSelect(layer.id)}
          className="shrink-0 hover:bg-muted rounded p-1 transition-colors"
        >
          {isSelected ? (
            <CheckSquare className="h-4 w-4 text-accent" />
          ) : (
            <Square className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <LayerTypeIcon type={layer.type} />
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate text-sm sm:text-base">{layer.name}</div>
            <div className="text-xs sm:text-sm text-muted-foreground flex items-center gap-1 sm:gap-2 flex-wrap">
              <Badge
                variant="secondary"
                className={cn('text-xs px-1.5 py-0', getLayerTypeColor(layer.type))}
              >
                {layer.type}
              </Badge>
              {layer.metadata.geometryType && (
                <span className="text-xs hidden sm:inline">{layer.metadata.geometryType}</span>
              )}
              {layer.metadata.featureCount && (
                <span className="text-xs hidden md:inline">
                  {layer.metadata.featureCount.toLocaleString()} features
                </span>
              )}
            </div>
          </div>
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2 sm:px-3 shrink-0"
          onClick={handleImport}
          disabled={isImporting}
        >
          <Download className="h-3 w-3 sm:mr-1" />
          <span className="hidden sm:inline">{isImporting ? 'Importing...' : 'Import'}</span>
        </Button>
      </div>
    )
  }

  // Grid view
  return (
    <div
      className={`border rounded-lg p-3 sm:p-4 hover:bg-muted/50 transition-colors space-y-2 sm:space-y-3 h-full flex flex-col ${isSelected ? 'bg-accent/10 border-accent/30 dark:bg-accent/10 dark:border-accent/30' : ''}`}
    >
      <div className="flex items-start gap-2">
        <button
          onClick={() => onToggleSelect(layer.id)}
          className="shrink-0 hover:bg-muted rounded p-1 transition-colors -ml-1 -mt-1"
        >
          {isSelected ? (
            <CheckSquare className="h-4 w-4 text-accent" />
          ) : (
            <Square className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
        <LayerTypeIcon type={layer.type} />
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate text-sm sm:text-base">{layer.name}</div>
          <div className="text-xs sm:text-sm text-muted-foreground mt-1">
            <Badge
              variant="secondary"
              className={cn('text-xs px-1.5 py-0', getLayerTypeColor(layer.type))}
            >
              {layer.type}
            </Badge>
          </div>
        </div>
      </div>

      <div className="space-y-1 text-xs sm:text-sm text-muted-foreground flex-1">
        {layer.metadata.geometryType && (
          <div className="flex items-center gap-1">
            <span className="w-14 sm:w-16 shrink-0 text-xs">Type:</span>
            <span className="truncate">{layer.metadata.geometryType}</span>
          </div>
        )}
        {layer.metadata.featureCount && (
          <div className="flex items-center gap-1">
            <span className="w-14 sm:w-16 shrink-0 text-xs">Features:</span>
            <span className="truncate">{layer.metadata.featureCount.toLocaleString()}</span>
          </div>
        )}
      </div>

      <Button
        variant="outline"
        size="sm"
        className="w-full text-xs sm:text-sm h-8 sm:h-9 mt-auto"
        onClick={handleImport}
        disabled={isImporting}
      >
        <Download className="h-3 w-3 sm:mr-2" />
        <span>{isImporting ? 'Importing...' : 'Import'}</span>
      </Button>
    </div>
  )
}

export const LayersDatabaseModal: React.FC<LayersDatabaseModalProps> = ({
  isOpen,
  onOpenChange
}) => {
  const layers = useLayerStore((state) => state.layers)
  const addLayer = useLayerStore((state) => state.addLayer)
  const addError = useLayerStore((state) => state.addError)
  const removeLayer = useLayerStore((state) => state.removeLayer)
  const loadFromPersistence = useLayerStore((state) => state.loadFromPersistence)
  const isLoading = useLayerStore((state) => state.isLoading)
  const currentChatId = useChatHistoryStore((state) => state.currentChatId)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState<FilterType>('all')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [hasLoadedOnOpen, setHasLoadedOnOpen] = useState(false)
  const [selectedLayerIds, setSelectedLayerIds] = useState<Set<string>>(new Set())
  const [isDeleting, setIsDeleting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)

  // Load layers from persistence when modal opens
  useEffect(() => {
    if (isOpen && !hasLoadedOnOpen) {
      loadFromPersistence(true) // Include imported layers for database modal
        .then(() => {
          setHasLoadedOnOpen(true)
        })
        .catch(() => {
          // Still mark as loaded to prevent repeated attempts
          setHasLoadedOnOpen(true)
        })
    }

    // Reset loaded flag when modal closes
    if (!isOpen && hasLoadedOnOpen) {
      setHasLoadedOnOpen(false)
    }
  }, [isOpen, hasLoadedOnOpen, loadFromPersistence])

  // Show all layers from the database
  const databaseLayers = Array.from(layers.values())

  // Filter layers based on search and filter type
  const filteredLayers = databaseLayers.filter((layer) => {
    const matchesSearch =
      !searchQuery || layer.name.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesFilter = filterType === 'all' || layer.type === filterType
    return matchesSearch && matchesFilter
  })

  const handleImportLayer = async (layer: LayerDefinition) => {
    try {
      // Only allow import if there's a current chat session
      if (!currentChatId) {
        return
      }

      // Create a copy of the layer with a new ID for the chat session
      const importedLayer: Omit<LayerDefinition, 'id' | 'createdAt' | 'updatedAt'> = {
        name: layer.name,
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
    } catch (error) {
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

  const handleToggleLayerSelection = (layerId: string) => {
    setSelectedLayerIds((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(layerId)) {
        newSet.delete(layerId)
      } else {
        newSet.add(layerId)
      }
      return newSet
    })
  }

  const handleSelectAll = () => {
    const allLayerIds = new Set(filteredLayers.map((l) => l.id))
    setSelectedLayerIds(allLayerIds)
  }

  const handleDeselectAll = () => {
    setSelectedLayerIds(new Set())
  }

  const handleDeleteSelected = () => {
    if (selectedLayerIds.size === 0) return
    setIsDeleteDialogOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (selectedLayerIds.size === 0) return

    setIsDeleting(true)
    try {
      // Delete layers one by one
      for (const layerId of selectedLayerIds) {
        try {
          await removeLayer(layerId)
        } catch (error) {
          toast.error(`Failed to delete layer: ${layerId}`, {
            description: error instanceof Error ? error.message : 'Unknown error'
          })
        }
      }

      // Clear selection
      setSelectedLayerIds(new Set())

      toast.success(
        `Successfully deleted ${selectedLayerIds.size} layer${selectedLayerIds.size > 1 ? 's' : ''}`,
        {
          description: 'Layers have been permanently removed from the database'
        }
      )
    } catch {
      toast.error('Failed to delete selected layers', {
        description: 'Some layers may not have been deleted. Please try again.'
      })
    } finally {
      setIsDeleting(false)
    }
  }

  const handleImportSelected = async () => {
    if (selectedLayerIds.size === 0) return

    if (!currentChatId) {
      toast.error('Cannot import layers', {
        description: 'No active chat session'
      })
      return
    }

    setIsImporting(true)
    let successCount = 0
    let errorCount = 0
    const errors: string[] = []

    try {
      // Import layers one by one
      for (const layerId of selectedLayerIds) {
        try {
          const layer = databaseLayers.find((l) => l.id === layerId)
          if (layer) {
            await handleImportLayer(layer)
            successCount++
          } else {
            errorCount++
            errors.push(`Layer ${layerId} not found`)
          }
        } catch (error) {
          errorCount++
          const errorMsg = error instanceof Error ? error.message : 'Unknown error'
          errors.push(errorMsg)
        }
      }

      // Clear selection after import attempt
      setSelectedLayerIds(new Set())

      // Show appropriate toast message
      if (errorCount === 0) {
        toast.success(`Successfully imported ${successCount} layer${successCount > 1 ? 's' : ''}`, {
          description: 'All selected layers added to current chat session'
        })
      } else if (successCount > 0) {
        toast.success(`Imported ${successCount} of ${selectedLayerIds.size} layers`, {
          description: `${errorCount} layer${errorCount > 1 ? 's' : ''} failed to import`
        })
      } else {
        toast.error('Failed to import selected layers', {
          description: errors.length > 0 ? errors[0] : 'All import operations failed'
        })
      }
    } catch {
      toast.error('Bulk import failed', {
        description: 'An unexpected error occurred during import'
      })
    } finally {
      setIsImporting(false)
    }
  }

  const stats = {
    total: databaseLayers.length,
    vector: databaseLayers.filter((l) => l.type === 'vector').length,
    raster: databaseLayers.filter((l) => l.type === 'raster').length
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-6xl h-[90vh] max-h-[90vh] flex flex-col sm:w-[90vw] md:w-[85vw] lg:max-w-4xl xl:max-w-5xl overflow-hidden">
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
        <div className="flex flex-wrap items-center gap-2 sm:gap-4 p-3 sm:p-4 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
            <Layer3 className="h-3 w-3 sm:h-4 sm:w-4" />
            <span className="font-medium">{stats.total}</span>
            <span className="text-muted-foreground hidden sm:inline">total layers</span>
            <span className="text-muted-foreground sm:hidden">total</span>
          </div>
          <div className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
            <div className="w-2 h-2 bg-green-500 rounded-full" />
            <span className="font-medium">{stats.vector}</span>
            <span className="text-muted-foreground">vector</span>
          </div>
          <div className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
            <div className="w-2 h-2 bg-blue-500 rounded-full" />
            <span className="font-medium">{stats.raster}</span>
            <span className="text-muted-foreground">raster</span>
          </div>
        </div>

        {/* Selection Actions */}
        {selectedLayerIds.size > 0 && (
          <div className="flex items-center justify-between gap-2 p-3 bg-accent/10 border border-accent/30 rounded-lg">
            <div className="flex items-center gap-2 text-sm">
              <CheckSquare className="h-4 w-4 text-accent" />
              <span className="font-medium">
                {selectedLayerIds.size} layer{selectedLayerIds.size > 1 ? 's' : ''} selected
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDeselectAll}
                className="h-8 px-2 text-xs"
              >
                Deselect All
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleImportSelected}
                disabled={isImporting}
                className="h-8 px-3 text-xs"
              >
                <Download className="h-3 w-3 mr-1" />
                {isImporting ? 'Importing...' : 'Import Selected'}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDeleteSelected}
                disabled={isDeleting}
                className="h-8 px-3 text-xs"
              >
                <Trash2 className="h-3 w-3 mr-1" />
                {isDeleting ? 'Deleting...' : 'Delete Selected'}
              </Button>
            </div>
          </div>
        )}

        {/* Search and Filters */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search layers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-9"
            />
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <Select value={filterType} onValueChange={(value: FilterType) => setFilterType(value)}>
              <SelectTrigger className="w-24 sm:w-32 h-9">
                <Filter className="h-4 w-4 sm:mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="vector">Vector</SelectItem>
                <SelectItem value="raster">Raster</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2">
              {filteredLayers.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={
                    selectedLayerIds.size === filteredLayers.length
                      ? handleDeselectAll
                      : handleSelectAll
                  }
                  className="h-9 px-2 sm:px-3 text-xs sm:text-sm whitespace-nowrap"
                >
                  {selectedLayerIds.size === filteredLayers.length ? (
                    <>
                      <CheckSquare className="h-3 w-3 sm:mr-1" />
                      <span className="hidden sm:inline">Deselect All</span>
                    </>
                  ) : (
                    <>
                      <Square className="h-3 w-3 sm:mr-1" />
                      <span className="hidden sm:inline">Select All</span>
                    </>
                  )}
                </Button>
              )}

              <div className="flex items-center border rounded-lg">
                <Button
                  variant={viewMode === 'grid' ? 'default' : 'ghost'}
                  size="sm"
                  className="h-9 px-2 sm:px-3 rounded-r-none border-r"
                  onClick={() => setViewMode('grid')}
                >
                  <Grid className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === 'list' ? 'default' : 'ghost'}
                  size="sm"
                  className="h-9 px-2 sm:px-3 rounded-l-none"
                  onClick={() => setViewMode('list')}
                >
                  <List className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Layers Grid/List */}
        <ScrollArea className="flex-1 min-h-0 w-full h-full pr-2">
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
                {searchQuery || filterType !== 'all'
                  ? 'No layers match your criteria'
                  : 'No layers in database'}
              </div>
              <div className="text-muted-foreground">
                {searchQuery || filterType !== 'all'
                  ? 'Try adjusting your search or filter settings'
                  : 'Create persistent layers using LLM tools or import files to the database first'}
              </div>
            </div>
          ) : (
            <div className="p-2">
              <div
                className={cn(
                  viewMode === 'grid'
                    ? 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 sm:gap-4'
                    : 'space-y-2'
                )}
              >
                {filteredLayers.map((layer) => (
                  <LayerCard
                    key={layer.id}
                    layer={layer}
                    viewMode={viewMode}
                    isSelected={selectedLayerIds.has(layer.id)}
                    onImport={handleImportLayer}
                    onToggleSelect={handleToggleLayerSelection}
                  />
                ))}
              </div>
            </div>
          )}
        </ScrollArea>
      </DialogContent>

      {/* Confirmation Dialog for Deleting Selected Layers */}
      <ConfirmationDialog
        isOpen={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        title="Delete Selected Layers"
        description={`Are you sure you want to delete ${selectedLayerIds.size} selected layer${selectedLayerIds.size > 1 ? 's' : ''}? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={handleConfirmDelete}
        variant="destructive"
      />
    </Dialog>
  )
}
