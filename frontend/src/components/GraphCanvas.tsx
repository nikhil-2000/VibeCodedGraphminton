import ForceGraph2D from 'react-force-graph-2d'
import type { Partnership, Player } from '../types'

interface Props {
  players: Player[]
  partnerships: Partnership[]
}

interface GraphNode {
  id: number
  name: string
  val: number
}

interface GraphLink {
  source: number
  target: number
  value: number
  win_rate: number
}

export default function GraphCanvas({ players, partnerships }: Props) {
  const nodes: GraphNode[] = players.map((p) => ({
    id: p.id,
    name: p.canonical_name,
    val: 1,
  }))

  const links: GraphLink[] = partnerships.map((p) => ({
    source: p.player_a_id,
    target: p.player_b_id,
    value: p.games_together,
    win_rate: p.win_rate,
  }))

  return (
    <ForceGraph2D
      graphData={{ nodes, links }}
      nodeLabel="name"
      nodeColor={() => '#facc15'}
      nodeRelSize={5}
      linkWidth={(link) => Math.max(1, (link as GraphLink).value / 3)}
      linkColor={(link) => {
        const wr = (link as GraphLink).win_rate
        return wr >= 0.6 ? '#4ade80' : wr >= 0.4 ? '#facc15' : '#f87171'
      }}
      linkDirectionalArrowLength={0}
      backgroundColor="transparent"
    />
  )
}
