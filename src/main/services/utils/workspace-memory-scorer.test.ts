import { describe, expect, it } from 'vitest'
import {
  computeRecencyScore,
  distanceToSimilarity,
  scoreWorkspaceMemory
} from './workspace-memory-scorer'

describe('workspace-memory-scorer', () => {
  it('maps distance to similarity in [0, 1]', () => {
    expect(distanceToSimilarity(0)).toBe(1)
    expect(distanceToSimilarity(1)).toBe(0.5)
    expect(distanceToSimilarity(2)).toBe(0)
    expect(distanceToSimilarity(3)).toBe(0)
  })

  it('applies exponential recency decay', () => {
    const now = new Date('2026-02-17T00:00:00.000Z')
    const recent = computeRecencyScore('2026-02-16T12:00:00.000Z', now, 24)
    const older = computeRecencyScore('2026-02-10T00:00:00.000Z', now, 24)

    expect(recent).toBeGreaterThan(older)
    expect(recent).toBeGreaterThan(0)
    expect(older).toBeGreaterThan(0)
  })

  it('combines similarity and recency into a final score', () => {
    const now = new Date('2026-02-17T00:00:00.000Z')
    const newer = scoreWorkspaceMemory(0.2, '2026-02-16T18:00:00.000Z', {
      now,
      similarityWeight: 0.7,
      recencyWeight: 0.3,
      halfLifeHours: 48
    })
    const stale = scoreWorkspaceMemory(0.2, '2026-01-15T18:00:00.000Z', {
      now,
      similarityWeight: 0.7,
      recencyWeight: 0.3,
      halfLifeHours: 48
    })

    expect(newer.similarityScore).toBe(stale.similarityScore)
    expect(newer.recencyScore).toBeGreaterThan(stale.recencyScore)
    expect(newer.finalScore).toBeGreaterThan(stale.finalScore)
  })
})
