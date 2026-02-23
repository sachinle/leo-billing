// src/hooks/useBackButton.js
// Intercepts the Android hardware back button using Capacitor App plugin.
// Instead of exiting the app, it navigates back in browser history.
// If there's no history to go back to (user is on the first page), 
// pressing back twice within 2 seconds exits the app gracefully.

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';

export function useBackButton() {
  const navigate = useNavigate();

  useEffect(() => {
    // Only run on native Android — do nothing on web
    if (!Capacitor.isNativePlatform()) return;

    let backPressCount = 0;
    let backPressTimer = null;

    async function setupBackButton() {
      // Dynamically import to avoid errors on web where plugin isn't available
      const { App } = await import('@capacitor/app');

      const handler = await App.addListener('backButton', () => {
        // If there's browser history, go back normally
        if (window.history.length > 1) {
          navigate(-1);
          return;
        }

        // No history left — double-press to exit
        backPressCount++;

        if (backPressCount === 1) {
          // Show a toast hint
          import('@capacitor/toast').then(({ Toast }) => {
            Toast.show({
              text: 'Press back again to exit',
              duration: 'short',
              position: 'bottom',
            });
          }).catch(() => {});

          // Reset count after 2 seconds
          backPressTimer = setTimeout(() => {
            backPressCount = 0;
          }, 2000);

        } else if (backPressCount >= 2) {
          // Second press — exit app
          clearTimeout(backPressTimer);
          App.exitApp();
        }
      });

      // Return cleanup function
      return () => {
        handler.remove();
        clearTimeout(backPressTimer);
      };
    }

    let cleanup;
    setupBackButton().then(fn => { cleanup = fn; });

    return () => { cleanup?.(); };
  }, [navigate]);
}