import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './popup.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('CoinTrunk popup: #root container not found');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
