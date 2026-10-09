import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/assets/styles.css';
import { applyCachedAppearance } from '@/lib/useAppearance';
import { App } from '../sidepanel/App';

applyCachedAppearance();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App surface="popup" />
  </StrictMode>,
);
