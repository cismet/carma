import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';

import App from './app/App.jsx';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
if (typeof global === 'undefined') {
  window.global = window;
}
root.render(
  <StrictMode>
    <App />
  </StrictMode>
);
