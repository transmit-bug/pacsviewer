import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from '@/components/ui/toast';
import App from './App';
import './index.css';
import './i18n';

// Initialize Cornerstone.js eagerly so the first viewport is fast
import { initCornerstone } from '@/lib/cornerstone/init';
initCornerstone().catch((err) => console.error('[Cornerstone] Init failed:', err));

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <Toaster />
    </BrowserRouter>
  </React.StrictMode>
);
