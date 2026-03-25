import { describe, expect, it } from 'vitest'
import {
  buildQgisSearchMatchExpression,
  normalizeQgisSearchText,
  tokenizeQgisSearchText
} from './qgis-search-text'

describe('qgis-search-text', () => {
  it('normalizes and tokenizes natural-language search text consistently', () => {
    expect(normalizeQgisSearchText('Sort line features by length, descending!')).toBe(
      'sort line features by length descending'
    )
    expect(tokenizeQgisSearchText('Sort line features by length, descending!')).toEqual([
      'sort',
      'line',
      'features',
      'by',
      'length',
      'descending'
    ])
  })

  it('builds an FTS match expression with phrase and prefix terms', () => {
    expect(buildQgisSearchMatchExpression('sort line features by length descending')).toBe(
      '"sort line features by length descending" OR sort* OR line* OR features* OR by* OR length* OR descending*'
    )
  })
})
