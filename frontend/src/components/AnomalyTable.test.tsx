import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import AnomalyTable from './AnomalyTable'
import type { AnomalyEntry } from '../types'

const entries: AnomalyEntry[] = [
  { player_a_id: 1, player_b_id: 2, actual: 8, expected: 2.67, deviation: 5.33 },
]

const playerNames: Record<number, string> = { 1: 'Alice', 2: 'Bob' }

describe('AnomalyTable', () => {
  it('renders player names', () => {
    render(<AnomalyTable entries={entries} playerNames={playerNames} />)
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
  })

  it('renders actual count', () => {
    render(<AnomalyTable entries={entries} playerNames={playerNames} />)
    expect(screen.getByText('8')).toBeInTheDocument()
  })

  it('renders positive deviation in green', () => {
    render(<AnomalyTable entries={entries} playerNames={playerNames} />)
    const deviationCell = screen.getByText('+5.33')
    expect(deviationCell).toHaveClass('text-green-500')
  })
})
