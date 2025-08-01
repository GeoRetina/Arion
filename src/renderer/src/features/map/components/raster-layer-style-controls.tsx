/**
 * Raster Layer Style Controls Component
 *
 * Specialized style controls for raster layers.
 * Provides raster-specific opacity control for the paint properties.
 */

import React, { useCallback } from 'react'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { LayerStyle } from '../../../../../shared/types/layer-types'

interface RasterLayerStyleControlsProps {
  style: LayerStyle
  onStyleChange: (updates: Partial<LayerStyle>) => void
}

export const RasterLayerStyleControls: React.FC<RasterLayerStyleControlsProps> = ({
  style,
  onStyleChange
}) => {
  // Raster-specific opacity control (applies to the raster paint properties)
  const handleRasterOpacityChange = useCallback(
    (rasterOpacity: number) => {
      onStyleChange({ rasterOpacity })
    },
    [onStyleChange]
  )

  return (
    <div className="space-y-4">
      {/* Raster-specific opacity control */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Raster Properties</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">
              Controls the opacity of the raster image itself
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-sm">Raster Opacity</Label>
              <span className="text-xs text-muted-foreground">
                {Math.round((style.rasterOpacity || 1) * 100)}%
              </span>
            </div>
            <Slider
              value={[style.rasterOpacity || 1]}
              onValueChange={(values) => handleRasterOpacityChange(values[0])}
              min={0}
              max={1}
              step={0.05}
              className="w-full"
            />
            <div className="text-xs text-muted-foreground">
              Note: This controls the transparency of the raster image itself.
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Info card explaining raster limitations */}
      <Card className="bg-muted/30">
        <CardContent className="pt-6">
          <div className="text-sm text-muted-foreground">
            <p className="font-medium mb-2">About Raster Layer Styling</p>
            <p className="text-xs">
              Raster layers have limited styling options compared to vector layers. The primary
              control available is opacity, which determines how transparent the raster image
              appears on the map.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
