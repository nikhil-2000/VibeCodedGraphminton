import { Routes, Route, Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import Nav from './components/Nav'
import LeaderboardPage from './pages/LeaderboardPage'
import PlayersPage from './pages/PlayersPage'
import PlayerDetailPage from './pages/PlayerDetailPage'
import GamesPage from './pages/GamesPage'
import UploadPage from './pages/UploadPage'
import GraphPage from './pages/GraphPage'
import AnomaliesPage from './pages/AnomaliesPage'
import SeasonsPage from './pages/SeasonsPage'
import { useCurrentUser } from './context/CurrentUserContext'

function AdminRoute({ children }: { children: ReactNode }) {
  const { isAdmin } = useCurrentUser()
  return isAdmin ? <>{children}</> : <Navigate to="/" replace />
}

export default function App() {
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Nav />
      <main className="flex-1 overflow-y-auto px-4 py-8 pb-20 md:pb-8">
        <Routes>
          <Route path="/" element={<Navigate to="/leaderboard" replace />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route path="/players" element={<PlayersPage />} />
          <Route path="/players/:id" element={<PlayerDetailPage />} />
          <Route path="/games" element={<GamesPage />} />
          <Route path="/graph" element={<GraphPage />} />
          <Route path="/anomalies" element={<AnomaliesPage />} />
          <Route path="/upload" element={<AdminRoute><UploadPage /></AdminRoute>} />
          <Route path="/seasons" element={<AdminRoute><SeasonsPage /></AdminRoute>} />
        </Routes>
      </main>
    </div>
  )
}
