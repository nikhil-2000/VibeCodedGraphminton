import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { Sun, Moon, Menu, X, CalendarDays } from 'lucide-react'
import { useTheme } from '../hooks/useTheme'
import PlayerFilterPopover from './PlayerFilterPopover'
import { Select, SelectContent, SelectItem, SelectTrigger } from './ui/select'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'
import { useSeasonFilter } from '../context/SeasonFilterContext'

const links = [
  { to: '/leaderboard', label: 'Leaderboard' },
  { to: '/players', label: 'Players' },
  { to: '/games', label: 'Games' },
  { to: '/anomalies', label: 'Anomalies' },
  { to: '/seasons', label: 'Seasons' },
  { to: '/upload', label: 'Upload' },
]

export default function Nav() {
  const { theme, toggle } = useTheme()
  const { seasons, selectedSeasonId, setSelectedSeasonId } = useSeasonFilter()
  const [menuOpen, setMenuOpen] = useState(false)

  const seasonSelect = seasons.length > 0 && (
    <Select
      value={selectedSeasonId != null ? String(selectedSeasonId) : 'all'}
      onValueChange={(v) => setSelectedSeasonId(v === 'all' ? null : Number(v))}
    >
      <SelectTrigger className="h-8 w-36 text-xs">
        <span>
          {selectedSeasonId == null
            ? 'All seasons'
            : (seasons.find((s) => s.id === selectedSeasonId)?.name ?? 'Season')}
        </span>
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
  )

  return (
    <nav className="border-b border-border bg-card px-4">
      {/* Desktop */}
      <div className="mx-auto hidden max-w-5xl items-center gap-1 py-3 sm:flex">
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
          {seasonSelect}
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

      {/* Mobile top bar */}
      <div className="flex items-center justify-between py-3 sm:hidden">
        <span className="font-bold text-yellow-400">Graph-minton</span>
        <div className="flex items-center gap-1">
          {seasons.length > 0 && (
            <Popover>
              <PopoverTrigger
                className={`rounded p-1.5 transition-colors hover:text-foreground ${selectedSeasonId != null ? 'text-yellow-400' : 'text-muted-foreground'}`}
                aria-label="Select season"
              >
                <CalendarDays size={16} />
              </PopoverTrigger>
              <PopoverContent className="w-44 p-1" align="end">
                <button
                  onClick={() => setSelectedSeasonId(null)}
                  className={`w-full rounded px-3 py-1.5 text-left text-sm transition-colors hover:bg-muted ${
                    selectedSeasonId == null ? 'font-medium text-yellow-400' : 'text-muted-foreground'
                  }`}
                >
                  All seasons
                </button>
                {seasons.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSelectedSeasonId(s.id)}
                    className={`w-full rounded px-3 py-1.5 text-left text-sm transition-colors hover:bg-muted ${
                      selectedSeasonId === s.id ? 'font-medium text-yellow-400' : 'text-muted-foreground'
                    }`}
                  >
                    {s.name}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          )}
          <PlayerFilterPopover iconOnly />
          <button
            onClick={toggle}
            className="rounded p-1.5 text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="rounded p-1.5 text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Toggle menu"
          >
            {menuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {menuOpen && (
        <div className="border-t border-border pb-3 sm:hidden">
          <div className="flex flex-col gap-1 pt-2">
            {links.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  `rounded px-3 py-2 text-sm transition-colors ${
                    isActive
                      ? 'bg-yellow-400 text-gray-950 font-medium'
                      : 'text-muted-foreground hover:text-foreground'
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
          </div>
        </div>
      )}
    </nav>
  )
}
