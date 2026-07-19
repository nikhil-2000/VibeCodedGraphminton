import { apiFetch } from './client'
import type { Season, SeasonCreate, SeasonUpdate } from '../types'

export const getSeasons = () => apiFetch<Season[]>('/seasons')

export const createSeason = (data: SeasonCreate) =>
  apiFetch<Season>('/seasons', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

export const updateSeason = (id: number, data: SeasonUpdate) =>
  apiFetch<Season>(`/seasons/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
