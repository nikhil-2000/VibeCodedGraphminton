import type { GameDetail } from '../types'

interface Props {
  game: GameDetail
}

export default function GameCard({ game }: Props) {
  const aWon = game.team_a_score > game.team_b_score
  return (
    <div className="rounded-lg border border-border bg-card p-4">
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
