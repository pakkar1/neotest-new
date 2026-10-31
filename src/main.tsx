import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './services/auth';
import { ToastProvider } from './components/ui/Toast';
import './styles/index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Elemen #root tidak ditemukan pada index.html');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
