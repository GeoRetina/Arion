/**
 * Layer Style Editor Component
 *
 * A comprehensive style editor for map layers supporting both vector and raster layers.
 * Uses react-color-palette for color selection and provides appropriate controls
 * based on layer type.
 */

import React, { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { LayerDefinition, LayerStyle } from '../../../../../shared/types/layer-types'
import { VectorLayerStyleControls } from './vector-layer-style-controls'
import { RasterLayerStyleControls } from './raster-layer-style-controls'

interface LayerStyleEditorProps {
  isOpen: boolean
  onClose: () => void
  layer: LayerDefinition | null
  onStyleChange: (layerId: string, style: Partial<LayerStyle>) => void
}

export const LayerStyleEditor: React.FC<LayerStyleEditorProps> = ({
  isOpen,
  onClose,
  layer,
  onStyleChange
}) => {
  const [isDirty, setIsDirty] = useState(false)

  const handleStyleChange = useCallback(
    (updates: Partial<LayerStyle>) => {
      if (!layer) return

      setIsDirty(true)
      onStyleChange(layer.id, updates)
    },
    [layer, onStyleChange]
  )

  const handleClose = useCallback(() => {
    setIsDirty(false)
    onClose()
  }, [onClose])

  const handleReset = useCallback(() => {
    if (!layer) return

    // Reset to default styles based on layer type
    if (layer.type === 'vector') {
      handleStyleChange({
        pointRadius: 6,
        pointColor: '#3b82f6',
        pointOpacity: 0.8,
        pointStrokeColor: '#ffffff',
        pointStrokeWidth: 2,
        pointStrokeOpacity: 1,
        lineColor: '#3b82f6',
        lineWidth: 2,
        lineOpacity: 0.8,
        fillColor: '#3b82f6',
        fillOpacity: 0.3,
        fillOutlineColor: '#1e40af'
      })
    } else if (layer.type === 'raster') {
      handleStyleChange({
        rasterOpacity: 1
      })
    }

    setIsDirty(true)
  }, [layer, handleStyleChange])

  if (!layer) {
    return null
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader className="pb-4">
          <DialogTitle className="text-lg font-semibold">Style Editor: {layer.name}</DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-6">
            {/* Layer Info */}
            <div className="text-sm text-muted-foreground">
              <span className="font-medium">Type:</span> {layer.type}
              {layer.metadata.geometryType && (
                <>
                  <span className="ml-4 font-medium">Geometry:</span> {layer.metadata.geometryType}
                </>
              )}
            </div>

            {/* Style Controls based on layer type */}
            {layer.type === 'vector' ? (
              <VectorLayerStyleControls
                style={layer.style}
                geometryType={layer.metadata.geometryType}
                onStyleChange={handleStyleChange}
              />
            ) : (
              <RasterLayerStyleControls style={layer.style} onStyleChange={handleStyleChange} />
            )}
          </div>
        </ScrollArea>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-4">
          <Button variant="outline" size="sm" onClick={handleReset} disabled={!isDirty}>
            Reset to Default
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleClose}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
