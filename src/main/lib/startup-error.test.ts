import { describe, expect, it } from 'vitest'
import { buildStartupErrorDetail, formatStartupError } from './startup-error'

describe('startup-error', () => {
  it('formats Error instances using the stack when available', () => {
    const error = new Error('Boom')
    error.stack = 'Error: Boom\n    at startup'

    expect(formatStartupError(error)).toBe('Error: Boom\n    at startup')
  })

  it('builds readable startup error details with context', () => {
    const detail = buildStartupErrorDetail(new Error('Missing migration'), {
      appPath: 'E:\\Arion\\resources\\app.asar',
      userDataPath: 'C:\\Users\\shaha\\AppData\\Roaming\\arion'
    })

    expect(detail).toContain('A required startup service failed to initialize.')
    expect(detail).toContain('Missing migration')
    expect(detail).toContain('App path: E:\\Arion\\resources\\app.asar')
    expect(detail).toContain('User data path: C:\\Users\\shaha\\AppData\\Roaming\\arion')
  })
})
