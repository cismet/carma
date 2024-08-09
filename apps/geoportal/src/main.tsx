import * as ReactDOM from 'react-dom/client';
import App from './app/App';
import { Provider } from 'react-redux';
import { RouterProvider, createHashRouter } from 'react-router-dom';
import { PersistGate } from 'redux-persist/integration/react';
import { persistStore } from 'redux-persist';
import { configurePortalStore } from '#/libraries/appframeworks/portals/src/lib/store';
import { layerMap } from './app/config/layermap';
import { APP_KEY, STORAGE_PREFIX } from './app/helper/constants';
import {suppressReactCismapErrors}  from '@carma-commons/utils';

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

suppressReactCismapErrors();

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
