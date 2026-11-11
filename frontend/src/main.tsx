import '@fontsource/barlow/400'
import '@fontsource/barlow/500'
import '@fontsource/barlow/600'
import '@fontsource/big-shoulders-display/700'
import '@fontsource/big-shoulders-display/800'
import '@fontsource/big-shoulders-display/900'
import './index.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App'
import { applyStoredTheme } from './lib/theme'

applyStoredTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
