import React, { ReactNode, useMemo, useRef, useState, useEffect } from 'react'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'

export interface MapToolbarItem {
  id: string
  icon: ReactNode
  label: string
  onClick: () => void
  isActive?: boolean
}

interface MapToolbarProps {
  items: MapToolbarItem[]
}

// Layout constants
const BUTTON_SIZE = 32
const BUTTON_GAP = 8
const PADDING_X = 60
const PADDING_Y = 6
const CURVE_WIDTH = 36
const CORNER_RADIUS = 26

export const MapToolbar: React.FC<MapToolbarProps> = ({ items }) => {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)

  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width)
      }
    })
    observer.observe(el)
    return (): void => observer.disconnect()
  }, [])

  const pocketContentWidth =
    items.length * BUTTON_SIZE + Math.max(0, items.length - 1) * BUTTON_GAP
  const pocketWidth = pocketContentWidth + PADDING_X * 2
  const pocketDepth = BUTTON_SIZE + PADDING_Y * 2
  const svgHeight = pocketDepth + 1

  const paths = useMemo(() => {
    if (containerWidth === 0) return { stroke: '', fill: '' }

    const w = containerWidth
    const r = CORNER_RADIUS
    const center = w / 2
    const pocketLeft = center - pocketWidth / 2
    const pocketRight = center + pocketWidth / 2
    const curveStart = Math.max(0, pocketLeft - CURVE_WIDTH)
    const curveEnd = Math.min(w, pocketRight + CURVE_WIDTH)
    const bottomY = pocketDepth

    const pocketCurves = [
      `C ${curveStart + CURVE_WIDTH * 0.85} 0, ${pocketLeft} 0, ${pocketLeft} ${bottomY - r}`,
      `Q ${pocketLeft} ${bottomY}, ${pocketLeft + r} ${bottomY}`,
      `L ${pocketRight - r} ${bottomY}`,
      `Q ${pocketRight} ${bottomY}, ${pocketRight} ${bottomY - r}`,
      `C ${pocketRight} 0, ${curveEnd - CURVE_WIDTH * 0.85} 0, ${curveEnd} 0`
    ].join(' ')

    // Full path with tails for the border stroke
    const stroke = [
      `M 0 0`,
      `L ${curveStart} 0`,
      pocketCurves,
      `L ${w} 0`,
      `Z`
    ].join(' ')

    // Pocket-only path for the glass background fill
    const fill = [`M ${curveStart} 0`, pocketCurves, `Z`].join(' ')

    return { stroke, fill }
  }, [containerWidth, pocketWidth, pocketDepth])

  if (items.length === 0) return null

  return (
    <div
      ref={wrapperRef}
      className="absolute top-0 left-0 right-0 z-30 pointer-events-none"
      style={{ height: svgHeight }}
    >
      {containerWidth > 0 && (
        <>
          {/* Glass background clipped to just the pocket */}
          <div
            className="absolute inset-0"
            style={{
              clipPath: `path('${paths.fill}')`,
              backgroundColor: 'color-mix(in oklch, var(--card) 85%, transparent)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)'
            }}
          />

          {/* Border stroke via SVG */}
          <svg
            width={containerWidth}
            height={svgHeight}
            className="absolute inset-0"
            style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.1))' }}
          >
            <path d={paths.stroke} fill="none" style={{ stroke: 'var(--border)', strokeWidth: 1 }} />
          </svg>

          {/* Buttons centered in the pocket */}
          <div
            className="absolute pointer-events-auto flex items-center gap-2"
            style={{
              left: '50%',
              transform: 'translateX(-50%)',
              top: PADDING_Y,
              height: BUTTON_SIZE
            }}
          >
            {items.map((item) => (
              <Tooltip key={item.id}>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={item.onClick}
                    className={`h-8 w-8 rounded-md ${item.isActive ? 'bg-muted' : 'hover:bg-muted/50'}`}
                  >
                    {item.icon}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{item.label}</TooltipContent>
              </Tooltip>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
