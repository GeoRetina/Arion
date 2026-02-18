import { isRecord } from '../../utils'
import { readString } from './common'

const getNestedString = (record: Record<string, unknown>, path: string[]): string | null => {
  let current: unknown = record

  for (const part of path) {
    if (!isRecord(current)) {
      return null
    }
    current = current[part]
  }

  return readString(current)
}

export const parseGoogleApiErrorMessage = async (response: Response): Promise<string> => {
  const rawBody = await response.text()
  if (rawBody.trim().length === 0) {
    return 'No response body'
  }

  try {
    const parsed = JSON.parse(rawBody) as unknown
    if (isRecord(parsed) && isRecord(parsed.error)) {
      const apiError = parsed.error
      const message = typeof apiError.message === 'string' ? apiError.message.trim() : ''
      const status = typeof apiError.status === 'string' ? apiError.status.trim() : ''
      if (message && status) return `${status}: ${message}`
      if (message) return message
      if (status) return status
    }
  } catch {
    void 0
  }

  return rawBody.trim().slice(0, 300)
}

export const buildEarthEngineAlgorithmsUrl = (
  discoveryPayload: Record<string, unknown>,
  projectId: string
): URL => {
  const rootUrl =
    typeof discoveryPayload.rootUrl === 'string' && discoveryPayload.rootUrl.trim().length > 0
      ? discoveryPayload.rootUrl
      : 'https://earthengine.googleapis.com/'

  const pathTemplate =
    getNestedString(discoveryPayload, [
      'resources',
      'projects',
      'resources',
      'algorithms',
      'methods',
      'list',
      'path'
    ]) || 'v1/projects/{+project}/algorithms'

  const projectPath = `projects/${projectId}`
  const resolvedPath = pathTemplate
    .replace('{+project}', projectPath)
    .replace('{project}', projectPath)
    .replace('{projectId}', projectId)

  return new URL(resolvedPath, rootUrl)
}
