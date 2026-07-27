import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { resolveActiveSkin, startSkin } from './activeSkin';
import './popup.css';

// Paint the default skin before first render (no unstyled frame) and follow the
// OS light↔dark switch, then re-skin to the active token once the background
// resolves it: the BZE skin for BZE, the default skin otherwise (BUS-34).
startSkin();
void resolveActiveSkin();

const container = document.getElementById('root');
if (!container) {
  throw new Error('CoinTrunk popup: #root container not found');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
