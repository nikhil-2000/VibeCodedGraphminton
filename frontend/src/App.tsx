import { Routes, Route, Navigate } from 'react-router-dom'
import Nav from './components/Nav'
import LeaderboardPage from './pages/LeaderboardPage'
import PlayersPage from './pages/PlayersPage'
import PlayerDetailPage from './pages/PlayerDetailPage'
import GamesPage from './pages/GamesPage'
import UploadPage from './pages/UploadPage'
import GraphPage from './pages/GraphPage'
import AnomaliesPage from './pages/AnomaliesPage'
import SeasonsPage from './pages/SeasonsPage'
import { SeasonFilterProvider } from './context/SeasonFilterContext'

export default function App() {
  return (
    <SeasonFilterProvider>
      <div className="min-h-screen bg-background text-foreground">
        <Nav />
        <main className="mx-auto max-w-5xl px-4 py-8">
          <Routes>
            <Route path="/" element={<Navigate to="/leaderboard" replace />} />
            <Route path="/leaderboard" element={<LeaderboardPage />} />
            <Route path="/players" element={<PlayersPage />} />
            <Route path="/players/:id" element={<PlayerDetailPage />} />
            <Route path="/games" element={<GamesPage />} />
            <Route path="/graph" element={<GraphPage />} />
            <Route path="/anomalies" element={<AnomaliesPage />} />
            <Route path="/upload" element={<UploadPage />} />
            <Route path="/seasons" element={<SeasonsPage />} />
          </Routes>
        </main>
      </div>
    </SeasonFilterProvider>
  )
}
