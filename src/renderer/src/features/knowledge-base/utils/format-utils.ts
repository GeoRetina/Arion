/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes'

  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']

  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
}

/**
 * Format date to human-readable string
 */
export function formatDate(date: Date): string {
  // Use Intl API for localized date formatting
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }

  return new Intl.DateTimeFormat('en-US', options).format(date)
}

/**
 * Format relative time (e.g., "2 days ago")
 */
export function formatRelativeTime(date: Date): string {
  const now = new Date()
  const diffInMilliseconds = now.getTime() - date.getTime()

  const diffInSeconds = Math.floor(diffInMilliseconds / 1000)
  const diffInMinutes = Math.floor(diffInSeconds / 60)
  const diffInHours = Math.floor(diffInMinutes / 60)
  const diffInDays = Math.floor(diffInHours / 24)

  if (diffInDays > 7) {
    return formatDate(date)
  } else if (diffInDays > 1) {
    return `${diffInDays} days ago`
  } else if (diffInDays === 1) {
    return 'Yesterday'
  } else if (diffInHours > 1) {
    return `${diffInHours} hours ago`
  } else if (diffInHours === 1) {
    return '1 hour ago'
  } else if (diffInMinutes > 1) {
    return `${diffInMinutes} minutes ago`
  } else if (diffInMinutes === 1) {
    return '1 minute ago'
  } else {
    return 'Just now'
  }
}
