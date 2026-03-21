import React, { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import type {
  LayerDefinition,
  LayerSourceConfig,
  RasterRgbBandSelection
} from '../../../../../shared/types/layer-types'
import {
  areRasterRgbBandSelectionsEqual,
  buildRasterTileUrlWithRgbBandSelection,
  parseRasterRgbBandSelectionFromTileUrl
} from '../../../../../shared/lib/raster-band-urls'

interface RasterRgbBandControlsProps {
  layer: LayerDefinition
  onSourceConfigChange: (layerId: string, sourceConfig: LayerSourceConfig) => Promise<void>
  onClose?: () => void
}

export const RasterRgbBandControls: React.FC<RasterRgbBandControlsProps> = ({
  layer,
  onSourceConfigChange,
  onClose
}) => {
  const bandCount = layer.sourceConfig.options?.rasterBandCount
  const hasRasterSource =
    layer.type === 'raster' &&
    layer.sourceConfig.type === 'raster' &&
    typeof layer.sourceConfig.data === 'string'

  const canConfigure =
    hasRasterSource &&
    typeof bandCount === 'number' &&
    Number.isInteger(bandCount) &&
    bandCount >= 3 &&
    typeof layer.sourceConfig.options?.rasterAssetId === 'string' &&
    layer.sourceConfig.options.rasterAssetId.length > 0

  const activeSelection = useMemo(() => {
    if (!canConfigure) {
      return null
    }

    return (
      layer.sourceConfig.options?.rasterRgbBands ??
      parseRasterRgbBandSelectionFromTileUrl(layer.sourceConfig.data as string) ??
      getDefaultRasterRgbBandSelection()
    )
  }, [canConfigure, layer.sourceConfig.data, layer.sourceConfig.options?.rasterRgbBands])

  const [redBand, setRedBand] = useState('')
  const [greenBand, setGreenBand] = useState('')
  const [blueBand, setBlueBand] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!activeSelection) {
      setRedBand('')
      setGreenBand('')
      setBlueBand('')
      return
    }

    setRedBand(String(activeSelection.red))
    setGreenBand(String(activeSelection.green))
    setBlueBand(String(activeSelection.blue))
  }, [activeSelection])

  if (!canConfigure || !activeSelection || typeof bandCount !== 'number') {
    return null
  }

  const isDirty =
    redBand !== String(activeSelection.red) ||
    greenBand !== String(activeSelection.green) ||
    blueBand !== String(activeSelection.blue)
  const defaultSelection = getDefaultRasterRgbBandSelection()
  const isUsingDefaultSelection = areRasterRgbBandSelectionsEqual(activeSelection, defaultSelection)

  const handleApply = async (): Promise<void> => {
    const parsedSelection = parseInputBands(redBand, greenBand, blueBand, bandCount)
    if (!parsedSelection) {
      toast.error('Invalid RGB band selection', {
        description: `Use whole numbers between 1 and ${bandCount}.`
      })
      return
    }

    const normalizedSelection = areRasterRgbBandSelectionsEqual(parsedSelection, defaultSelection)
      ? null
      : parsedSelection

    const nextSourceConfig = buildUpdatedSourceConfig(layer.sourceConfig, normalizedSelection)

    setIsSaving(true)
    try {
      await onSourceConfigChange(layer.id, nextSourceConfig)
    } catch (error) {
      toast.error('Failed to update RGB bands', {
        description: error instanceof Error ? error.message : 'An unknown error occurred'
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleReset = async (): Promise<void> => {
    if (isUsingDefaultSelection) {
      setRedBand(String(defaultSelection.red))
      setGreenBand(String(defaultSelection.green))
      setBlueBand(String(defaultSelection.blue))
      return
    }

    const nextSourceConfig = buildUpdatedSourceConfig(layer.sourceConfig, null)

    setIsSaving(true)
    try {
      await onSourceConfigChange(layer.id, nextSourceConfig)
    } catch (error) {
      toast.error('Failed to reset RGB bands', {
        description: error instanceof Error ? error.message : 'An unknown error occurred'
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="border border-border rounded-lg p-3 mt-1 space-y-3 bg-muted/30">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="text-sm font-medium">RGB Bands</div>
          <div className="text-xs text-muted-foreground">
            Choose which raster bands feed the red, green, and blue channels.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-xs text-muted-foreground">{bandCount} bands</div>
          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 rounded-md hover:bg-muted!"
              onClick={onClose}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <Label htmlFor={`rgb-red-${layer.id}`} className="text-xs text-red-600">
            Red
          </Label>
          <Input
            id={`rgb-red-${layer.id}`}
            type="number"
            inputMode="numeric"
            min={1}
            max={bandCount}
            step={1}
            value={redBand}
            onChange={(event) => setRedBand(event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`rgb-green-${layer.id}`} className="text-xs text-green-600">
            Green
          </Label>
          <Input
            id={`rgb-green-${layer.id}`}
            type="number"
            inputMode="numeric"
            min={1}
            max={bandCount}
            step={1}
            value={greenBand}
            onChange={(event) => setGreenBand(event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`rgb-blue-${layer.id}`} className="text-xs text-blue-600">
            Blue
          </Label>
          <Input
            id={`rgb-blue-${layer.id}`}
            type="number"
            inputMode="numeric"
            min={1}
            max={bandCount}
            step={1}
            value={blueBand}
            onChange={(event) => setBlueBand(event.target.value)}
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">
          {isUsingDefaultSelection
            ? 'Using the default 1 / 2 / 3 mapping.'
            : `Current mapping: ${activeSelection.red} / ${activeSelection.green} / ${activeSelection.blue}`}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            disabled={isSaving || (isUsingDefaultSelection && !isDirty)}
          >
            Default
          </Button>
          <Button size="sm" onClick={handleApply} disabled={isSaving || !isDirty}>
            {isSaving ? 'Applying...' : 'Apply'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function getDefaultRasterRgbBandSelection(): RasterRgbBandSelection {
  return {
    red: 1,
    green: 2,
    blue: 3
  }
}

function parseInputBands(
  redBand: string,
  greenBand: string,
  blueBand: string,
  bandCount: number
): RasterRgbBandSelection | null {
  const red = Number.parseInt(redBand, 10)
  const green = Number.parseInt(greenBand, 10)
  const blue = Number.parseInt(blueBand, 10)
  const bands = [red, green, blue]

  if (bands.some((band) => !Number.isInteger(band) || band < 1 || band > bandCount)) {
    return null
  }

  return { red, green, blue }
}

function buildUpdatedSourceConfig(
  sourceConfig: LayerSourceConfig,
  selection: RasterRgbBandSelection | null
): LayerSourceConfig {
  const sourceData = sourceConfig.data as string

  return {
    ...sourceConfig,
    data: buildRasterTileUrlWithRgbBandSelection(sourceData, selection),
    options: {
      ...sourceConfig.options,
      rasterRgbBands: selection ?? undefined
    }
  }
}
