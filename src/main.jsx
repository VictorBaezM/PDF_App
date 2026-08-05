import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Register PWA Service Worker for offline execution
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/PDF_App/service-worker.js')
      .then((reg) => console.log('PWA ServiceWorker registered:', reg.scope))
      .catch((err) => console.warn('PWA ServiceWorker registration failed:', err));
  });
}
