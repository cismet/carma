import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';
import {
  BrowserRouter,
  RouterProvider,
  createHashRouter,
} from 'react-router-dom';
import Bughunt from './Bughunt';
import App from './app/App';
import { PersistGate } from 'redux-persist/integration/react';
import { Provider } from 'react-redux';
import store from './store';
import { persistStore } from 'redux-persist';

const persistor = persistStore(store);

const router = createHashRouter(
  [
    {
      path: '/docs/:docPackageId?/:file?/:page?',
      element: <App />,
    },
    {
      path: '/',
      element: <App />,
    },
  ],
  {}
);

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <StrictMode>
    {/* <PersistGate loading={null} persistor={persistor}>
      <Provider store={store}>
        <RouterProvider router={router} />
      </Provider>
    </PersistGate> */}

    <Bughunt />
  </StrictMode>
);
