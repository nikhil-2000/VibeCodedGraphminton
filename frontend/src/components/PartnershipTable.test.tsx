import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import PartnershipTable from './PartnershipTable'
import type { PlayerPartnership } from '../types'

const partnerships: PlayerPartnership[] = [
  { partner_id: 2, games_together: 5, wins: 4, losses: 1, win_rate: 0.8 },
]
const playerNames: Record<number, string> = { 2: 'Bob' }

describe('PartnershipTable', () => {
  it('renders partner name as link', () => {
    render(<MemoryRouter><PartnershipTable partnerships={partnerships} playerNames={playerNames} /></MemoryRouter>)
    expect(screen.getByText('Bob')).toBeInTheDocument()
  })

  it('renders games together', () => {
    render(<MemoryRouter><PartnershipTable partnerships={partnerships} playerNames={playerNames} /></MemoryRouter>)
    expect(screen.getByText('5')).toBeInTheDocument()
  })
})
