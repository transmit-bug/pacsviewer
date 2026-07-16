import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from '@/components/ui/toast';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { useAppStore } from '@/stores/appStore';
import App from './App';
import './index.css';
import './i18n';

// Initialize Cornerstone.js eagerly so the first viewport is fast
import { initCornerstone } from '@/lib/cornerstone/init';
initCornerstone().catch((err) => console.error('[Cornerstone] Init failed:', err));

/** Apply the dark class to <html> based on appStore.theme */
function ThemeSync() {
  const theme = useAppStore((s) => s.theme);
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);
  return null;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ErrorBoundary>
        <TooltipProvider>
          <ThemeSync />
          <App />
          <Toaster />
        </TooltipProvider>
      </ErrorBoundary>
    </BrowserRouter>
  </React.StrictMode>
);
