import { apiFetch } from './client'
import type { AnomalyEntry } from '../types'

export const getPartnershipAnomalies = (type: 'overplayed' | 'underplayed', limit = 20) =>
  apiFetch<AnomalyEntry[]>(`/anomalies/partnerships/${type}?limit=${limit}`)

export const getHeadToHeadAnomalies = (type: 'overplayed' | 'underplayed', limit = 20) =>
  apiFetch<AnomalyEntry[]>(`/anomalies/head-to-head/${type}?limit=${limit}`)

export const getPartnershipAnomaliesForPlayer = (playerId: number, type: 'overplayed' | 'underplayed') =>
  apiFetch<AnomalyEntry[]>(`/anomalies/partnerships/${type}/${playerId}`)

export const getHeadToHeadAnomaliesForPlayer = (playerId: number, type: 'overplayed' | 'underplayed') =>
  apiFetch<AnomalyEntry[]>(`/anomalies/head-to-head/${type}/${playerId}`)
