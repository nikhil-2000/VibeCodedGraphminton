import { Routes, Route, Navigate } from 'react-router-dom'
import Nav from './components/Nav'
import LeaderboardPage from './pages/LeaderboardPage'
import PlayersPage from './pages/PlayersPage'
import PlayerDetailPage from './pages/PlayerDetailPage'
import UploadPage from './pages/UploadPage'

export default function App() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <Nav />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Routes>
          <Route path="/" element={<Navigate to="/leaderboard" replace />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route path="/players" element={<PlayersPage />} />
          <Route path="/players/:id" element={<PlayerDetailPage />} />
          <Route path="/games" element={<div>Games coming soon</div>} />
          <Route path="/graph" element={<div>Graph coming soon</div>} />
          <Route path="/anomalies" element={<div>Anomalies coming soon</div>} />
          <Route path="/upload" element={<UploadPage />} />
        </Routes>
      </main>
    </div>
  )
}
