import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import './styles/globals.css';

// Build marker — lets us confirm which bundle a deploy is serving.
if (typeof window !== 'undefined') {
  (window as unknown as { __DSPLN_BUILD__?: string }).__DSPLN_BUILD__ = 'locker-auth-config-20260723';
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
