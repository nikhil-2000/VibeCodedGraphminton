import { useState } from 'react'
import type { GameDetail } from '../types'
import { getGamePrediction, type GamePrediction } from '../api/games'

interface Props {
  game: GameDetail
  onDelete?: (id: number) => void
}

function stripColour(gap: number): string {
  if (gap <= 3) return 'bg-green-500'
  if (gap <= 6) return 'bg-yellow-500'
  return 'bg-red-500'
}

export default function GameCard({ game, onDelete }: Props) {
  const aWon = game.team_a_score > game.team_b_score
  const gap = Math.abs(game.team_a_score - game.team_b_score)

  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [expanded, setExpanded] = useState(false)
  const [prediction, setPrediction] = useState<GamePrediction | null>(null)
  const [loadingPrediction, setLoadingPrediction] = useState(false)

  const handleDelete = () => {
    if (!onDelete) return
    setDeleting(true)
    onDelete(game.id)
  }

  const handleTogglePrediction = () => {
    if (!expanded && !prediction) {
      setLoadingPrediction(true)
      getGamePrediction(game.id)
        .then(setPrediction)
        .finally(() => setLoadingPrediction(false))
    }
    setExpanded((v) => !v)
  }

  return (
    <div className="relative rounded-lg border border-border bg-card overflow-hidden">
      {confirming && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-lg bg-card/95">
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

      <div className="flex">
        {/* Colour strip */}
        <div className={`w-1 shrink-0 ${stripColour(gap)}`} />

        <div className="flex-1 p-4">
          {/* Header row */}
          <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>{game.played_on}</span>
            <div className="flex items-center gap-1.5">
              <span>Game #{game.game_number}</span>
              {onDelete && (
                <button
                  onClick={() => setConfirming(true)}
                  className="flex h-4 w-4 items-center justify-center rounded text-muted-foreground/40 hover:bg-destructive/10 hover:text-destructive"
                  aria-label="Delete game"
                >
                  ×
                </button>
              )}
            </div>
          </div>

          {/* Teams + scores */}
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

          {/* Prediction toggle */}
          <button
            onClick={handleTogglePrediction}
            className="mt-3 w-full text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            {expanded ? '▲ Hide prediction' : '▼ Show prediction'}
          </button>

          {/* Prediction content */}
          {expanded && (
            <div className="mt-2 border-t border-border pt-2">
              {loadingPrediction ? (
                <p className="text-center text-xs text-muted-foreground">Loading…</p>
              ) : prediction ? (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    Expected {prediction.expected_score_a.toFixed(1)}–{prediction.expected_score_b.toFixed(1)}
                  </span>
                  <span className={prediction.upset ? 'font-medium text-yellow-400' : 'text-muted-foreground'}>
                    {prediction.upset ? '⚡ Upset' : '✓ Expected result'}
                  </span>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
