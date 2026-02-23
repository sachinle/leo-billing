// ── Safe Area Setup for Capacitor Android ──────────────────────────────
// Add this to your main.jsx or App.jsx (top level, runs once on app start)
// This reads the real status bar height from the native layer and sets a
// CSS variable so your topbar can use it as a reliable fallback.

import { StatusBar, Style } from '@capacitor/status-bar';
import { Capacitor } from '@capacitor/core';

async function setupStatusBar() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    // Make status bar transparent + overlay the webview
    await StatusBar.setOverlaysWebView({ overlay: true });
    await StatusBar.setStyle({ style: Style.Dark }); // use Style.Light for light theme
    await StatusBar.setBackgroundColor({ color: '#00000000' }); // transparent

    // Get the actual status bar height and set it as a CSS variable
    const info = await StatusBar.getInfo();
    // info.height is in pixels — convert to safe CSS value
    if (info && info.height) {
      document.documentElement.style.setProperty(
        '--status-bar-height',
        `${info.height}px`
      );
    }
  } catch (e) {
    console.warn('StatusBar setup failed:', e);
  }
}

setupStatusBar();