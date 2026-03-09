export interface StartupErrorContext {
  appPath?: string | null
  userDataPath?: string | null
}

export function formatStartupError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack || `${error.name}: ${error.message}`
  }

  if (typeof error === 'string') {
    return error
  }

  try {
    return JSON.stringify(error, null, 2)
  } catch {
    return String(error)
  }
}

export function buildStartupErrorDetail(
  error: unknown,
  { appPath, userDataPath }: StartupErrorContext = {}
): string {
  const lines = [
    'A required startup service failed to initialize.',
    '',
    'Error details:',
    formatStartupError(error)
  ]

  if (appPath) {
    lines.push('', `App path: ${appPath}`)
  }

  if (userDataPath) {
    lines.push(`User data path: ${userDataPath}`)
  }

  return lines.join('\n')
}
