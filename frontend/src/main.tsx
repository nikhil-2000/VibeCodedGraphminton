import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { SeasonFilterProvider } from './context/SeasonFilterContext.tsx'
import { PlayerFilterProvider } from './context/PlayerFilterContext.tsx'

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('Root element not found')

createRoot(rootEl).render(
  <StrictMode>
    <BrowserRouter>
      <SeasonFilterProvider>
        <PlayerFilterProvider>
          <App />
        </PlayerFilterProvider>
      </SeasonFilterProvider>
    </BrowserRouter>
  </StrictMode>,
)
