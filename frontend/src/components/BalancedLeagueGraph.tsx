import { useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import { leagueEdges } from '../utils/leagueGraph'
import type { GameDetail } from '../types'

interface Props {
  /** The games revealed so far, in the order they were selected. */
  games: GameDetail[]
  names: Record<number, string>
}

interface GraphNode {
  id: number
  name: string
}

interface GraphLink {
  source: number | GraphNode
  target: number | GraphNode
  kind: 'with' | 'against'
  count: number
  fresh: boolean
}

const WITH_COLOUR = '#4ade80'
const AGAINST_COLOUR = '#f87171'
const FRESH_COLOUR = '#facc15'

export default function BalancedLeagueGraph({ games, names }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 800, height: 520 })
  // Node and link objects are mutated by the force engine (x/y/vx/vy), so keep them
  // stable across renders — otherwise every new game would restart the layout.
  const [nodeCache] = useState(() => new Map<number, GraphNode>())
  const [linkCache] = useState(() => new Map<string, GraphLink>())

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    observer.observe(el)
    setSize({ width: el.clientWidth, height: el.clientHeight })
    return () => observer.disconnect()
  }, [])

  const graphData = useMemo(() => {
    const edges = leagueEdges(games)
    const newest = games.length - 1
    const nodes = new Map<number, GraphNode>()
    const touch = (id: number) => {
      let node = nodeCache.get(id)
      if (!node) {
        node = { id, name: names[id] ?? String(id) }
        nodeCache.set(id, node)
      }
      nodes.set(id, node)
    }
    const links = edges.map((e) => {
      touch(e.a)
      touch(e.b)
      let link = linkCache.get(e.key)
      if (!link) {
        link = { source: e.a, target: e.b, kind: e.kind, count: e.count, fresh: false }
        linkCache.set(e.key, link)
      }
      link.count = e.count
      link.fresh = e.born === newest
      return link
    })
    return { nodes: [...nodes.values()], links }
  }, [games, names, nodeCache, linkCache])

  const graphRef = useRef<{ zoomToFit: (ms?: number, padding?: number) => void } | undefined>(undefined)
  const nodeCount = graphData.nodes.length
  useEffect(() => {
    // Refit as players join so the whole league stays in view.
    const t = setTimeout(() => graphRef.current?.zoomToFit(400, 60), 350)
    return () => clearTimeout(t)
  }, [nodeCount])

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
      <ForceGraph2D
        ref={graphRef as never}
        graphData={graphData}
        width={size.width}
        height={size.height}
        nodeLabel="name"
        nodeColor={() => '#facc15'}
        nodeRelSize={6}
        nodeCanvasObjectMode={() => 'after'}
        nodeCanvasObject={(node, ctx, scale) => {
          const n = node as GraphNode & { x?: number; y?: number }
          ctx.font = `${12 / scale}px sans-serif`
          ctx.textAlign = 'center'
          ctx.fillStyle = '#a1a1aa'
          ctx.fillText(n.name, n.x ?? 0, (n.y ?? 0) + 14 / scale)
        }}
        linkColor={(l) => {
          const link = l as GraphLink
          return link.fresh ? FRESH_COLOUR : link.kind === 'with' ? WITH_COLOUR : AGAINST_COLOUR
        }}
        linkWidth={(l) => ((l as GraphLink).fresh ? 3 : 1)}
        linkLineDash={(l) => ((l as GraphLink).kind === 'against' ? [4, 3] : null)}
        linkCurvature={(l) => ((l as GraphLink).kind === 'against' ? 0.25 : 0)}
        backgroundColor="transparent"
      />
    </div>
  )
}
