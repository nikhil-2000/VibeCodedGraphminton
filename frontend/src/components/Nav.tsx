import { NavLink } from 'react-router-dom'
import { Sun, Moon } from 'lucide-react'
import { useTheme } from '../hooks/useTheme'
import PlayerFilterPopover from './PlayerFilterPopover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { useSeasonFilter } from '../context/SeasonFilterContext'

const links = [
  { to: '/leaderboard', label: 'Leaderboard' },
  { to: '/players', label: 'Players' },
  { to: '/games', label: 'Games' },
  { to: '/graph', label: 'Graph' },
  { to: '/anomalies', label: 'Anomalies' },
  { to: '/seasons', label: 'Seasons' },
  { to: '/upload', label: 'Upload' },
]

export default function Nav() {
  const { theme, toggle } = useTheme()
  const { seasons, selectedSeasonId, setSelectedSeasonId } = useSeasonFilter()

  return (
    <nav className="border-b border-border bg-card px-4">
      <div className="mx-auto flex max-w-5xl items-center gap-1 py-3">
        <span className="mr-6 font-bold text-yellow-400">Graph-minton</span>
        {links.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `rounded px-3 py-1.5 text-sm transition-colors ${
                isActive
                  ? 'bg-yellow-400 text-gray-950 font-medium'
                  : 'text-muted-foreground hover:text-foreground'
              }`
            }
          >
            {label}
          </NavLink>
        ))}
        <div className="ml-auto flex items-center gap-2">
          {seasons.length > 0 && (
            <Select
              value={selectedSeasonId != null ? String(selectedSeasonId) : 'all'}
              onValueChange={(v) => setSelectedSeasonId(v === 'all' ? null : Number(v))}
            >
              <SelectTrigger className="h-8 w-36 text-xs">
                <SelectValue placeholder="Season" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All seasons</SelectItem>
                {seasons.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <PlayerFilterPopover />
          <button
            onClick={toggle}
            className="rounded p-1.5 text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </div>
    </nav>
  )
}
