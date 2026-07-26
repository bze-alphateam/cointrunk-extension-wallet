import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { applyTheme, preferredMode } from '../theme/apply';
import { DEFAULT_THEME_ID } from '../theme/themes';
import './popup.css';

// Theme the UI before first paint: the default skin in the holder's preferred
// colour mode. A later branding ticket picks the theme id from the active
// token; re-selecting is just another applyTheme call (BUS-29).
applyTheme(DEFAULT_THEME_ID, preferredMode());

// Follow the OS/browser light↔dark switch while the popup is open, keeping the
// same theme and only swapping the mode's palette.
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (event) => {
  applyTheme(DEFAULT_THEME_ID, event.matches ? 'dark' : 'light');
});

const container = document.getElementById('root');
if (!container) {
  throw new Error('CoinTrunk popup: #root container not found');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
