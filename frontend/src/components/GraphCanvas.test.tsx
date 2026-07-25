import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import GraphCanvas from './GraphCanvas'
import type { Partnership, Player } from '../types'

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

vi.mock('react-force-graph-2d', () => ({
  default: ({ graphData }: { graphData: { nodes: unknown[]; links: unknown[] } }) => (
    <div data-testid="graph-canvas">
      nodes:{graphData.nodes.length} links:{graphData.links.length}
    </div>
  ),
}))

const players: Player[] = [
  { id: 1, canonical_name: 'Alice', is_sub: false, is_admin: false, aliases: [] },
  { id: 2, canonical_name: 'Bob', is_sub: false, is_admin: false, aliases: [] },
]

const partnerships: Partnership[] = [
  { player_a_id: 1, player_b_id: 2, games_together: 5, wins: 4, losses: 1, win_rate: 0.8 },
]

describe('GraphCanvas', () => {
  it('renders a node per player', () => {
    render(<GraphCanvas players={players} partnerships={partnerships} />)
    expect(screen.getByText(/nodes:2/)).toBeInTheDocument()
  })

  it('renders a link per partnership', () => {
    render(<GraphCanvas players={players} partnerships={partnerships} />)
    expect(screen.getByText(/links:1/)).toBeInTheDocument()
  })
})
