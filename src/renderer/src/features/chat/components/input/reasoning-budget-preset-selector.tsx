import React from 'react'
import type { ReasoningBudgetPreset } from '../../../../../../shared/utils/model-capabilities'
import { ReasoningDropdownSelector } from './reasoning-dropdown-selector'

interface ReasoningBudgetPresetSelectorProps {
  value: ReasoningBudgetPreset
  availableValues: readonly ReasoningBudgetPreset[]
  onValueChange: (value: ReasoningBudgetPreset) => void
  disabled?: boolean
}

function formatReasoningBudgetPreset(value: ReasoningBudgetPreset): string {
  switch (value) {
    case 'auto':
      return 'Auto'
    default:
      return value.charAt(0).toUpperCase() + value.slice(1)
  }
}

export const ReasoningBudgetPresetSelector: React.FC<ReasoningBudgetPresetSelectorProps> = ({
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
      formatValue={formatReasoningBudgetPreset}
      triggerAriaLabel="Thinking budget"
      tooltipLabel="Set thinking budget"
      heading="Thinking Budget"
      disabled={disabled}
    />
  )
}
