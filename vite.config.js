import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Core React — loaded first, cached forever
          'react-core':  ['react', 'react-dom', 'react-router-dom'],
          // Firebase — heavy, split out
          'firebase':    ['firebase/app', 'firebase/auth'],
          // Supabase — split out
          'supabase':    ['@supabase/supabase-js'],
          // PDF/Image export — only loaded when user clicks export
          'pdf-export':  ['jspdf', 'html2canvas'],
          // Capacitor — only used on native
          'capacitor':   ['@capacitor/core', '@capacitor/filesystem', '@capacitor/share', '@capacitor/status-bar'],
        },
      },
    },
    // Warn only for chunks over 1MB
    chunkSizeWarningLimit: 1000,
  },
});