import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { Sun, Moon, Trophy, Users, Swords, FileText, CalendarDays, Upload, MoreHorizontal, Settings } from 'lucide-react'
import { useTheme } from '../hooks/useTheme'
import PlayerFilterPopover from './PlayerFilterPopover'
import { Select, SelectContent, SelectItem, SelectTrigger } from './ui/select'
import { Sheet, SheetContent } from './ui/sheet'
import { useSeasonFilter } from '../context/SeasonFilterContext'
import { usePrefsModal } from '../context/PrefsModalContext'
import { useCurrentUser } from '../context/CurrentUserContext'

const primaryLinks = [
  { to: '/leaderboard', label: 'Leaderboard', Icon: Trophy },
  { to: '/players', label: 'Players', Icon: Users },
  { to: '/games', label: 'Games', Icon: Swords },
  { to: '/anomalies', label: 'Fixtures', Icon: FileText },
]

const moreLinks = [
  { to: '/seasons', label: 'Seasons', Icon: CalendarDays },
  { to: '/upload', label: 'Upload', Icon: Upload },
]

function SeasonSelect() {
  const { seasons, selectedSeasonId, setSelectedSeasonId } = useSeasonFilter()
  if (seasons.length === 0) return null
  return (
    <Select
      value={selectedSeasonId != null ? String(selectedSeasonId) : 'all'}
      onValueChange={(v) => setSelectedSeasonId(v === 'all' ? null : Number(v))}
    >
      <SelectTrigger className="h-8 w-full text-xs">
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
}

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `flex flex-col items-center gap-1 rounded-lg py-3 transition-colors ${
    isActive
      ? 'bg-yellow-400 text-gray-950 font-medium'
      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
  }`

const controlBtnClass =
  'flex items-center justify-center gap-2 rounded-lg py-2 text-muted-foreground transition-colors hover:text-foreground hover:bg-muted'

function NavControls({ onAction }: { onAction?: () => void }) {
  const { theme, toggle } = useTheme()
  const { openModal } = usePrefsModal()
  return (
    <div className="flex flex-col gap-2">
      <SeasonSelect />
      <PlayerFilterPopover iconWithLabel />
      <button
        onClick={() => { openModal(); onAction?.() }}
        className={controlBtnClass}
        aria-label="Settings"
      >
        <Settings size={16} />
        <span className="text-xs">Settings</span>
      </button>
      <button
        onClick={() => { toggle(); onAction?.() }}
        className={controlBtnClass}
        aria-label="Toggle theme"
      >
        {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        <span className="text-xs">{theme === 'dark' ? 'Light' : 'Dark'}</span>
      </button>
    </div>
  )
}

export default function Nav() {
  const location = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)
  const { isAdmin } = useCurrentUser()

  const moreIsActive = isAdmin && moreLinks.some((l) => location.pathname.startsWith(l.to))

  return (
    <>
      {/* Desktop sidebar */}
      <nav className="hidden md:flex flex-col h-screen w-32 sticky top-0 shrink-0 overflow-y-auto border-r border-border bg-card">
        <div className="flex items-center justify-center py-5">
          <span className="text-3xl" aria-label="Graph-minton">🏸</span>
        </div>

        <div className="flex flex-col gap-1 px-2">
          {[...primaryLinks, ...(isAdmin ? moreLinks : [])].map(({ to, label, Icon }) => (
            <NavLink key={to} to={to} className={navLinkClass}>
              <Icon size={20} />
              <span className="text-xs">{label}</span>
            </NavLink>
          ))}
        </div>

        <div className="mt-auto px-2 pb-4">
          <NavControls />
        </div>
      </nav>

      {/* Mobile bottom tab bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex border-t border-border bg-card">
        {primaryLinks.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-0.5 py-2 transition-colors ${
                isActive ? 'text-yellow-400' : 'text-muted-foreground'
              }`
            }
          >
            <Icon size={20} />
            <span className="text-xs">{label}</span>
          </NavLink>
        ))}
        <button
          onClick={() => setMoreOpen(true)}
          className={`flex flex-1 flex-col items-center gap-0.5 py-2 transition-colors ${
            moreIsActive ? 'text-yellow-400' : 'text-muted-foreground'
          }`}
        >
          <MoreHorizontal size={20} />
          <span className="text-xs">More</span>
        </button>
      </nav>

      {/* More sheet (mobile) */}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="px-2 pb-8 pt-4">
          {isAdmin && (
            <>
              <div className="flex flex-col gap-1 mb-3">
                {moreLinks.map(({ to, label, Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    onClick={() => setMoreOpen(false)}
                    className={navLinkClass}
                  >
                    <Icon size={20} />
                    <span className="text-xs">{label}</span>
                  </NavLink>
                ))}
              </div>
              <hr className="mb-3 border-border" />
            </>
          )}
          <NavControls onAction={() => setMoreOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  )
}
