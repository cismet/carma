import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';

import App from './app/App.jsx';

const originalWarn = console.warn.bind(console);
const originalError = console.error.bind(console);
console.warn = (message, ...args) => {
  if (!message.includes('ReactDOM.render is no longer supported in React 18')) {
    originalWarn(message, ...args);
  }
};
console.error = (message, ...args) => {
  if (!message.includes('ReactDOM.render is no longer supported in React 18')) {
    originalError(message, ...args);
  }
};
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
