import React from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Arrow as PopoverArrow } from '@radix-ui/react-popover'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

interface ReasoningDropdownSelectorProps<TValue extends string> {
  value: TValue
  availableValues: readonly TValue[]
  onValueChange: (value: TValue) => void
  formatValue: (value: TValue) => string
  triggerAriaLabel: string
  tooltipLabel: string
  heading: string
  disabled?: boolean
}

export function ReasoningDropdownSelector<TValue extends string>({
  value,
  availableValues,
  onValueChange,
  formatValue,
  triggerAriaLabel,
  tooltipLabel,
  heading,
  disabled = false
}: ReasoningDropdownSelectorProps<TValue>): React.JSX.Element {
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled}
              aria-label={triggerAriaLabel}
              className="group h-8 px-2.5 rounded-md bg-transparent hover:bg-secondary/50 flex items-center gap-2 transition-colors border-0 shadow-none"
            >
              <span className="font-medium text-xs truncate">{formatValue(value)}</span>
              <ChevronDown className="h-3 w-3 text-foreground/50 ml-1" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p>{tooltipLabel}</p>
        </TooltipContent>
      </Tooltip>

      <PopoverContent
        className="w-44 overflow-hidden rounded-lg border border-border bg-popover p-0 shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        side="top"
        align="start"
        sideOffset={8}
      >
        <PopoverArrow className="fill-popover stroke-border" width={10} height={5} />
        <div className="flex flex-col">
          <div className="border-b border-border/40 bg-muted/40 px-2.5 py-1.5">
            <h4 className="text-xs font-medium text-foreground">{heading}</h4>
          </div>

          <div className="py-1">
            {availableValues.map((option) => {
              const isActive = option === value
              return (
                <button
                  key={option}
                  onClick={() => !isActive && onValueChange(option)}
                  disabled={isActive}
                  className={`w-full text-left px-2.5 py-1.5 flex items-center gap-2.5 transition-colors ${
                    isActive
                      ? 'bg-primary text-primary-foreground font-medium'
                      : 'hover:bg-secondary/30 text-foreground'
                  }`}
                >
                  <span className="grow truncate text-xs">{formatValue(option)}</span>
                  {isActive && <Check size={14} className="shrink-0 ml-auto" strokeWidth={2.5} />}
                </button>
              )
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
