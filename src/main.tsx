import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { RevisaoProvider } from './lib/RevisaoContext'
import './styles/globals.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <RevisaoProvider>
        <App />
      </RevisaoProvider>
    </BrowserRouter>
  </StrictMode>
)
