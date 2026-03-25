interface StatusChromeClasses {
  border: string
  bg: string
}

const NEUTRAL_STATUS_CHROME = {
  border: 'border-border/40',
  bg: 'bg-background'
} as const

export function applyNeutralStatusChrome<T extends StatusChromeClasses>(
  styles: T,
  enabled = true
): T {
  if (!enabled) {
    return styles
  }

  return {
    ...styles,
    ...NEUTRAL_STATUS_CHROME
  }
}
