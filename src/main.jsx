import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './safeArea.js';
import { ThemeProvider } from './context/ThemeContext'; // ← add this
import './index.css'   // global styles

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    
      <ThemeProvider>   {/* ← wraps everything so ALL pages get theme */}
        <App />
      </ThemeProvider>
    
  </React.StrictMode>,
)