import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';
import App from './app/App';
import { Provider } from 'react-redux';
// @ts-ignore
import store from './app/store';
import { RouterProvider, createHashRouter } from 'react-router-dom';
import AlternativeUI from './app/AlternativeUI';
import { PersistGate } from 'redux-persist/integration/react';
import { persistStore } from 'redux-persist';

const persistor = persistStore(store);

const router = createHashRouter([
  {
    path: '/',
    element: <App />,
  },
  {
    path: '/alternative',
    element: <AlternativeUI />,
  },
]);

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
