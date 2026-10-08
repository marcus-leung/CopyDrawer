import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/assets/styles.css';
import { applyCachedAppearance } from '@/lib/useAppearance';
import { Popup } from './Popup';

applyCachedAppearance();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Popup />
  </StrictMode>,
);
