import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './app/App'
import './styles/theme.css'
import './styles/global.css'
import './styles/catalog.css'
import './styles/sales.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>,
)
