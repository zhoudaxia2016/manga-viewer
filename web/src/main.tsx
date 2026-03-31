import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { ApiAuthProvider } from './contexts/ApiAuthContext';
import './index.css';

const base = import.meta.env.BASE_URL;
const routerBasename =
  base === '/' ? undefined : base.replace(/\/$/, '');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename={routerBasename}>
      <ApiAuthProvider>
        <App />
      </ApiAuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
