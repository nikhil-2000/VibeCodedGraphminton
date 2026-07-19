import { apiFetch } from './client'
import type { Season, SeasonCreate } from '../types'

export const getSeasons = () => apiFetch<Season[]>('/seasons')

export const createSeason = (data: SeasonCreate) =>
  apiFetch<Season>('/seasons', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
