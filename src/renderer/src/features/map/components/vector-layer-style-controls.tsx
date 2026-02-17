/**
 * Vector Layer Style Controls Component
 *
 * Specialized style controls for vector layers including points, lines, and polygons.
 * Provides controls for color, opacity, stroke width, and stroke color based on geometry type.
 */

import React, { useCallback } from 'react'
import { ColorPicker, useColor } from 'react-color-palette'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { LayerStyle } from '../../../../../shared/types/layer-types'

import 'react-color-palette/css'

interface VectorLayerStyleControlsProps {
  style: LayerStyle
  geometryType?: string
  onStyleChange: (updates: Partial<LayerStyle>) => void
}

interface ColorPickerSectionProps {
  title: string
  color: string
  opacity?: number
  onColorChange: (color: string) => void
  onOpacityChange?: (opacity: number) => void
}

const ColorPickerSection: React.FC<ColorPickerSectionProps> = ({
  title,
  color,
  opacity,
  onColorChange,
  onOpacityChange
}) => {
  const [colorState, setColorState] = useColor(color || '#3b82f6')

  const handleColorChange = useCallback(
    (newColor: typeof colorState) => {
      setColorState(newColor)
      onColorChange(newColor.hex)
    },
    [onColorChange, setColorState]
  )

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">{title}</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-16 p-0 border-2"
              style={{ backgroundColor: color }}
            >
              <span className="sr-only">Select {title.toLowerCase()}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-3">
            <ColorPicker
              color={colorState}
              onChange={handleColorChange}
              hideInput={['rgb', 'hsv']}
            />
          </PopoverContent>
        </Popover>
      </div>

      {opacity !== undefined && onOpacityChange && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">Opacity</Label>
            <span className="text-xs text-muted-foreground">{Math.round(opacity * 100)}%</span>
          </div>
          <Slider
            value={[opacity]}
            onValueChange={(values) => onOpacityChange(values[0])}
            min={0}
            max={1}
            step={0.05}
            className="w-full"
          />
        </div>
      )}
    </div>
  )
}

export const VectorLayerStyleControls: React.FC<VectorLayerStyleControlsProps> = ({
  style,
  geometryType,
  onStyleChange
}) => {
  const isPoint = !geometryType || geometryType === 'Point' || geometryType === 'MultiPoint'
  const isLine =
    !geometryType || geometryType === 'LineString' || geometryType === 'MultiLineString'
  const isPolygon = !geometryType || geometryType === 'Polygon' || geometryType === 'MultiPolygon'

  // Style update helpers
  const handleStyleUpdate = useCallback(
    (updates: Partial<LayerStyle>) => {
      onStyleChange(updates)
    },
    [onStyleChange]
  )

  return (
    <div className="space-y-4">
      {/* Point Styles */}
      {isPoint && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Point Style</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-4">
            <ColorPickerSection
              title="Fill Color"
              color={style.pointColor || '#3b82f6'}
              opacity={style.pointOpacity}
              onColorChange={(color) => handleStyleUpdate({ pointColor: color })}
              onOpacityChange={(opacity) => handleStyleUpdate({ pointOpacity: opacity })}
            />

            <Separator />

            <ColorPickerSection
              title="Stroke Color"
              color={style.pointStrokeColor || '#ffffff'}
              opacity={style.pointStrokeOpacity}
              onColorChange={(color) => handleStyleUpdate({ pointStrokeColor: color })}
              onOpacityChange={(opacity) => handleStyleUpdate({ pointStrokeOpacity: opacity })}
            />

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Radius</Label>
                <span className="text-xs text-muted-foreground">{style.pointRadius || 6}px</span>
              </div>
              <Slider
                value={[style.pointRadius || 6]}
                onValueChange={(values) => handleStyleUpdate({ pointRadius: values[0] })}
                min={1}
                max={50}
                step={1}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Stroke Width</Label>
                <span className="text-xs text-muted-foreground">
                  {style.pointStrokeWidth || 2}px
                </span>
              </div>
              <Slider
                value={[style.pointStrokeWidth || 2]}
                onValueChange={(values) => handleStyleUpdate({ pointStrokeWidth: values[0] })}
                min={0}
                max={10}
                step={0.5}
                className="w-full"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Line Styles */}
      {isLine && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Line Style</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-4">
            <ColorPickerSection
              title="Line Color"
              color={style.lineColor || '#3b82f6'}
              opacity={style.lineOpacity}
              onColorChange={(color) => handleStyleUpdate({ lineColor: color })}
              onOpacityChange={(opacity) => handleStyleUpdate({ lineOpacity: opacity })}
            />

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Line Width</Label>
                <span className="text-xs text-muted-foreground">{style.lineWidth || 2}px</span>
              </div>
              <Slider
                value={[style.lineWidth || 2]}
                onValueChange={(values) => handleStyleUpdate({ lineWidth: values[0] })}
                min={1}
                max={20}
                step={0.5}
                className="w-full"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Polygon Styles */}
      {isPolygon && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Polygon Style</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-4">
            <ColorPickerSection
              title="Fill Color"
              color={style.fillColor || '#3b82f6'}
              opacity={style.fillOpacity}
              onColorChange={(color) => handleStyleUpdate({ fillColor: color })}
              onOpacityChange={(opacity) => handleStyleUpdate({ fillOpacity: opacity })}
            />

            <Separator />

            <ColorPickerSection
              title="Outline Color"
              color={style.fillOutlineColor || '#1e40af'}
              onColorChange={(color) => handleStyleUpdate({ fillOutlineColor: color })}
            />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
