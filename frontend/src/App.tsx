import { Routes, Route, Navigate } from 'react-router-dom'
import Nav from './components/Nav'
import LeaderboardPage from './pages/LeaderboardPage'

export default function App() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <Nav />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Routes>
          <Route path="/" element={<Navigate to="/leaderboard" replace />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route path="/players" element={<div>Players coming soon</div>} />
          <Route path="/players/:id" element={<div>Player detail coming soon</div>} />
          <Route path="/games" element={<div>Games coming soon</div>} />
          <Route path="/graph" element={<div>Graph coming soon</div>} />
          <Route path="/anomalies" element={<div>Anomalies coming soon</div>} />
          <Route path="/upload" element={<div>Upload coming soon</div>} />
        </Routes>
      </main>
    </div>
  )
}
