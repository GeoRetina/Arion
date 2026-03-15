import React from 'react'
import type { ReasoningEffort } from '../../../../../../shared/utils/model-capabilities'
import { ReasoningDropdownSelector } from './reasoning-dropdown-selector'

interface ReasoningEffortSelectorProps {
  value: ReasoningEffort
  availableValues: readonly ReasoningEffort[]
  onValueChange: (value: ReasoningEffort) => void
  disabled?: boolean
}

function formatReasoningEffort(value: ReasoningEffort): string {
  switch (value) {
    case 'xhigh':
      return 'X-High'
    default:
      return value.charAt(0).toUpperCase() + value.slice(1)
  }
}

export const ReasoningEffortSelector: React.FC<ReasoningEffortSelectorProps> = ({
  value,
  availableValues,
  onValueChange,
  disabled = false
}) => {
  return (
    <ReasoningDropdownSelector
      value={value}
      availableValues={availableValues}
      onValueChange={onValueChange}
      formatValue={formatReasoningEffort}
      triggerAriaLabel="Reasoning effort"
      tooltipLabel="Set reasoning effort"
      heading="Reasoning Effort"
      disabled={disabled}
    />
  )
}
