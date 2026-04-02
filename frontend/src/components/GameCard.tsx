import type { Game } from '../types'

interface Props {
  game: Game
}

export default function GameCard({ game }: Props) {
  const aWon = game.team_a_score > game.team_b_score
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>{game.played_on}</span>
        {game.session !== null && <span>Session {game.session}</span>}
        <span>Game #{game.game_number}</span>
      </div>
      <div className="flex items-center justify-center gap-6 text-lg font-bold">
        <span className={aWon ? 'text-green-500' : 'text-muted-foreground'}>{game.team_a_score}</span>
        <span className="text-muted-foreground">vs</span>
        <span className={!aWon ? 'text-green-500' : 'text-muted-foreground'}>{game.team_b_score}</span>
      </div>
    </div>
  )
}
