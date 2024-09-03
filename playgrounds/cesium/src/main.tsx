import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { CESIUM_BASE_URL } from './app/config/app.config';
import { suppressReactCismapErrors } from '@carma-commons/utils';
import { Provider } from 'react-redux';
import { setupStore } from './app/store';
import defaultViewerState from './app/config';
declare global {
  interface Window {
    CESIUM_BASE_URL: string;
  }
}

suppressReactCismapErrors();

window.CESIUM_BASE_URL = CESIUM_BASE_URL;
const root = createRoot(document.getElementById('root') as HTMLElement);

const store = setupStore(defaultViewerState);

root.render(
  <Provider store={store}>
    <App />
  </Provider>
);
