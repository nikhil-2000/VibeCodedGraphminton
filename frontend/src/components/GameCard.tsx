import { useState } from 'react'
import type { GameDetail } from '../types'

interface Props {
  game: GameDetail
  onDelete?: (id: number) => void
}

export default function GameCard({ game, onDelete }: Props) {
  const aWon = game.team_a_score > game.team_b_score
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleDelete = () => {
    if (!onDelete) return
    setDeleting(true)
    onDelete(game.id)
  }

  return (
    <div className="relative rounded-lg border border-border bg-card p-4">
      {onDelete && !confirming && (
        <button
          onClick={() => setConfirming(true)}
          className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded text-muted-foreground/50 hover:bg-destructive/10 hover:text-destructive"
          aria-label="Delete game"
        >
          ×
        </button>
      )}
      {confirming && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-lg bg-card/95">
          <p className="text-xs text-muted-foreground">Delete this game?</p>
          <div className="flex gap-2">
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="rounded bg-destructive px-3 py-1 text-xs text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="rounded border border-border px-3 py-1 text-xs hover:bg-muted"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>{game.played_on}</span>
        <span>Game #{game.game_number}</span>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className="space-y-0.5">
          {game.team_a.map((p) => (
            <p key={p.id} className={`truncate text-sm ${aWon ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
              {p.canonical_name}
            </p>
          ))}
        </div>
        <div className="flex items-center gap-1 text-lg font-bold">
          <span className={aWon ? 'text-green-500' : 'text-muted-foreground'}>{game.team_a_score}</span>
          <span className="text-xs text-muted-foreground">–</span>
          <span className={!aWon ? 'text-green-500' : 'text-muted-foreground'}>{game.team_b_score}</span>
        </div>
        <div className="space-y-0.5 text-right">
          {game.team_b.map((p) => (
            <p key={p.id} className={`truncate text-sm ${!aWon ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
              {p.canonical_name}
            </p>
          ))}
        </div>
      </div>
    </div>
  )
}
