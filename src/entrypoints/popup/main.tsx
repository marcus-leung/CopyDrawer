import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/assets/styles.css';
import { applyCachedTheme } from '@/lib/useTheme';
import { Popup } from './Popup';

applyCachedTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Popup />
  </StrictMode>,
);
