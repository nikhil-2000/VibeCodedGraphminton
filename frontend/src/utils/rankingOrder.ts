const STORAGE_KEY = 'graphminton_player_ranking'

/**
 * The ordered ids to show: the stored order first (minus anyone outside the
 * current filter), then anyone not yet ranked in default order. Players with no
 * games are absent from `defaultOrder`, so they land last.
 */
export function reconcileRanking(stored: number[], defaultOrder: number[], filteredIds: number[]): number[] {
  const allowed = new Set(filteredIds)
  const kept = [...new Set(stored)].filter((id) => allowed.has(id))
  const placed = new Set(kept)
  const fromDefault = defaultOrder.filter((id) => allowed.has(id) && !placed.has(id))
  fromDefault.forEach((id) => placed.add(id))
  const rest = filteredIds.filter((id) => !placed.has(id))
  return [...kept, ...fromDefault, ...rest]
}

/**
 * Fold a reordered visible list back into the stored order without disturbing
 * players hidden by the current filter, so their positions survive a filter change.
 */
export function mergeVisibleOrder(stored: number[], visible: number[]): number[] {
  const visibleSet = new Set(visible)
  const queue = [...visible]
  const merged = stored.map((id) => (visibleSet.has(id) ? queue.shift()! : id))
  return [...merged, ...queue]
}

export function loadRanking(): number[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((id): id is number => Number.isInteger(id)) : []
  } catch {
    return []
  }
}

export function saveRanking(ids: number[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
  } catch {
    // ranking just won't persist
  }
}

export function clearRanking(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // nothing stored to clear
  }
}
