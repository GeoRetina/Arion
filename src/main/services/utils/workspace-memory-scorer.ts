export interface WorkspaceMemoryScoreConfig {
  similarityWeight?: number
  recencyWeight?: number
  halfLifeHours?: number
  now?: Date
}

export interface WorkspaceMemoryScore {
  similarityScore: number
  recencyScore: number
  finalScore: number
}

const DEFAULT_SIMILARITY_WEIGHT = 0.75
const DEFAULT_RECENCY_WEIGHT = 0.25
const DEFAULT_HALF_LIFE_HOURS = 72
const MIN_WEIGHT_SUM = 0.000001

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min
  }
  return Math.max(min, Math.min(max, value))
}

function normalizeWeights(
  similarityWeight: number,
  recencyWeight: number
): { similarityWeight: number; recencyWeight: number } {
  const safeSimilarity = Math.max(0, similarityWeight)
  const safeRecency = Math.max(0, recencyWeight)
  const sum = safeSimilarity + safeRecency

  if (sum < MIN_WEIGHT_SUM) {
    return {
      similarityWeight: DEFAULT_SIMILARITY_WEIGHT,
      recencyWeight: DEFAULT_RECENCY_WEIGHT
    }
  }

  return {
    similarityWeight: safeSimilarity / sum,
    recencyWeight: safeRecency / sum
  }
}

export function distanceToSimilarity(distance: number): number {
  // Cosine distance typically falls within [0, 2]. Map to [0, 1].
  return clamp(1 - distance / 2, 0, 1)
}

export function computeRecencyScore(
  createdAt: string,
  now: Date = new Date(),
  halfLifeHours: number = DEFAULT_HALF_LIFE_HOURS
): number {
  const createdAtMs = Date.parse(createdAt)
  if (!Number.isFinite(createdAtMs)) {
    return 0
  }

  const ageMs = Math.max(0, now.getTime() - createdAtMs)
  const ageHours = ageMs / (1000 * 60 * 60)
  const safeHalfLifeHours = halfLifeHours > 0 ? halfLifeHours : DEFAULT_HALF_LIFE_HOURS

  // Exponential decay where score halves every halfLifeHours.
  return Math.exp((-Math.log(2) * ageHours) / safeHalfLifeHours)
}

export function scoreWorkspaceMemory(
  distance: number,
  createdAt: string,
  config: WorkspaceMemoryScoreConfig = {}
): WorkspaceMemoryScore {
  const similarityScore = distanceToSimilarity(distance)
  const recencyScore = computeRecencyScore(
    createdAt,
    config.now ?? new Date(),
    config.halfLifeHours ?? DEFAULT_HALF_LIFE_HOURS
  )
  const weights = normalizeWeights(
    config.similarityWeight ?? DEFAULT_SIMILARITY_WEIGHT,
    config.recencyWeight ?? DEFAULT_RECENCY_WEIGHT
  )
  const finalScore =
    similarityScore * weights.similarityWeight + recencyScore * weights.recencyWeight

  return {
    similarityScore,
    recencyScore,
    finalScore
  }
}
