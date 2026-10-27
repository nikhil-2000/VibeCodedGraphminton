import { describe, it, expect } from 'vitest'
import { reconcileRanking, mergeVisibleOrder } from './rankingOrder'

describe('reconcileRanking', () => {
  it('uses the default order when nothing is stored', () => {
    expect(reconcileRanking([], [3, 1, 2], [1, 2, 3])).toEqual([3, 1, 2])
  })

  it('keeps the stored order', () => {
    expect(reconcileRanking([2, 3, 1], [1, 2, 3], [1, 2, 3])).toEqual([2, 3, 1])
  })

  it('drops players outside the current filter', () => {
    expect(reconcileRanking([4, 2, 1], [1, 2], [1, 2])).toEqual([2, 1])
  })

  it('appends unranked players at the bottom in default order', () => {
    expect(reconcileRanking([2, 1], [3, 1, 2, 4], [1, 2, 3, 4])).toEqual([2, 1, 3, 4])
  })

  it('puts unranked players with no games last, since they are missing from the default order', () => {
    // 5 has no games so is not in the default order; 3 is new but has games
    expect(reconcileRanking([2, 1], [3, 1, 2], [1, 2, 3, 5])).toEqual([2, 1, 3, 5])
  })

  it('ignores duplicate stored ids', () => {
    expect(reconcileRanking([1, 1, 2], [1, 2], [1, 2])).toEqual([1, 2])
  })
})

describe('mergeVisibleOrder', () => {
  it('replaces the visible players in place and leaves hidden ones where they were', () => {
    // 9 is hidden by the filter and sits between 1 and 2
    expect(mergeVisibleOrder([1, 9, 2, 3], [3, 2, 1])).toEqual([3, 9, 2, 1])
  })

  it('appends newly ranked players', () => {
    expect(mergeVisibleOrder([1, 2], [2, 4, 1])).toEqual([2, 4, 1])
  })

  it('keeps the visible players in their new relative order', () => {
    const merged = mergeVisibleOrder([5, 1, 9, 2], [2, 1, 7, 5])
    expect(merged.filter((id) => [1, 2, 5, 7].includes(id))).toEqual([2, 1, 7, 5])
    expect(merged).toContain(9)
  })
})
