import * as ReactDOM from 'react-dom/client';
import App from './app/App';
import { Provider } from 'react-redux';
import { RouterProvider, createHashRouter } from 'react-router-dom';
import { PersistGate } from 'redux-persist/integration/react';
import { persistStore } from 'redux-persist';
import { configurePortalStore } from '#/libraries/appframeworks/portals/src/lib/store';
import { layerMap } from './app/config/layermap';
import { APP_KEY, STORAGE_PREFIX } from './app/helper/constants';

const store = configurePortalStore({
  APP_KEY,
  STORAGE_PREFIX,
  layerMap: layerMap
});

const persistor = persistStore(store);

const router = createHashRouter([
  {
    path: '/',
    element: <App />,
  },
  {
    path: '/publish',
    element: <App published={true} />,
  },
]);

const originalWarn = console.warn.bind(console);
const originalError = console.error.bind(console);
console.warn = (message, ...args) => {
  if (
    message &&
    !message.includes('ReactDOM.render is no longer supported in React 18')
  ) {
    originalWarn(message, ...args);
  }
};
console.error = (message, ...args) => {
  if (
    message &&
    !message.includes('ReactDOM.render is no longer supported in React 18')
  ) {
    originalError(message, ...args);
  }
};

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <PersistGate loading={null} persistor={persistor}>
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>
  </PersistGate>
);
