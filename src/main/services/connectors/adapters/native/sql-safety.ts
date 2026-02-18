const SELECT_LIKE_QUERY = /^\s*(select|with|explain)\b/i
const DANGEROUS_SQL_KEYWORDS =
  /\b(insert|update|delete|alter|create|drop|truncate|grant|revoke|merge|call|copy|vacuum|reindex|cluster|refresh)\b/i

export const isReadOnlyQuery = (query: string): { valid: boolean; message?: string } => {
  const normalized = query.trim()
  if (!SELECT_LIKE_QUERY.test(normalized)) {
    return {
      valid: false,
      message: 'Only read-only SELECT/WITH/EXPLAIN queries are allowed.'
    }
  }

  const nonEmptyStatements = normalized
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)

  if (nonEmptyStatements.length > 1) {
    return {
      valid: false,
      message: 'Only a single SQL statement is allowed.'
    }
  }

  if (DANGEROUS_SQL_KEYWORDS.test(normalized) || /\bselect[\s\S]*\binto\b/i.test(normalized)) {
    return {
      valid: false,
      message: 'Mutating SQL keywords are not allowed in this capability.'
    }
  }

  return { valid: true }
}
