import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import ApiKeyDialog from './components/ApiKeyDialog';
import { installKeyFetch } from './lib/geminiKey';

installKeyFetch();
import { BrowserRouter } from "react-router-dom";

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
      <App />
      <ApiKeyDialog />
   </React.StrictMode>
);
