import { apiFetch } from './client'

export interface UserPreferences {
  id: string
  player_id: number
  season_id: number | null
  preset: string
  custom_player_ids: number[]
}

export interface PreferencesCreate {
  player_id: number
  season_id?: number | null
  preset?: string
  custom_player_ids?: number[]
}

export interface PreferencesUpdate {
  player_id?: number
  season_id?: number | null
  preset?: string
  custom_player_ids?: number[]
}

export function getPreferences(): Promise<UserPreferences> {
  return apiFetch<UserPreferences>('/preferences')
}

export function createPreferences(body: PreferencesCreate): Promise<UserPreferences> {
  return apiFetch<UserPreferences>('/preferences', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export function updatePreferences(body: PreferencesUpdate): Promise<UserPreferences> {
  return apiFetch<UserPreferences>('/preferences', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}
