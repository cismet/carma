import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';
import reportWebVitals from './app/reportWebVitals';
import * as serviceWorkerRegistration from './app/serviceWorkerRegistration';

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

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://cra.link/PWA
serviceWorkerRegistration.register();

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
// reportWebVitals();
