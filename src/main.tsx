import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { ObraProvider } from './lib/ObraContext'
import './styles/globals.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ObraProvider>
        <App />
      </ObraProvider>
    </BrowserRouter>
  </StrictMode>
)
