import { apiFetch } from './client'
import type { FixtureDifficultyEntry } from '../types'

export const getFixtureDifficulty = (playerIds: number[], evenThreshold = 1) =>
  apiFetch<FixtureDifficultyEntry[]>(`/fixture-difficulty?even_threshold=${evenThreshold}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ player_ids: playerIds }),
  })
