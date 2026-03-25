export function normalizeQgisSearchText(value: string | undefined): string {
  if (!value) {
    return ''
  }

  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

export function tokenizeQgisSearchText(value: string): string[] {
  return Array.from(
    new Set(
      normalizeQgisSearchText(value)
        .split(' ')
        .map((token) => token.trim())
        .filter((token) => token.length > 0)
    )
  )
}

export function buildQgisSearchMatchExpression(query: string): string | null {
  const normalizedQuery = normalizeQgisSearchText(query)
  const queryTerms = tokenizeQgisSearchText(normalizedQuery)
  if (!normalizedQuery || queryTerms.length === 0) {
    return null
  }

  return buildMatchExpression(normalizedQuery, queryTerms)
}

function buildMatchExpression(normalizedQuery: string, queryTerms: string[]): string {
  const expressions = [
    normalizedQuery.includes(' ') ? `"${normalizedQuery}"` : null,
    ...queryTerms.map((term) => `${term}*`)
  ].filter((value): value is string => typeof value === 'string' && value.length > 0)

  return Array.from(new Set(expressions)).join(' OR ')
}
