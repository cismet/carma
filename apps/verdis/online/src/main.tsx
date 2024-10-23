import { StrictMode } from "react";
import * as ReactDOM from "react-dom/client";
import { RouterProvider, createHashRouter } from "react-router-dom";
import { Provider } from "react-redux";

import TopicMapContextProvider from "react-cismap/contexts/TopicMapContextProvider";
import { MappingConstants } from "react-cismap";
import { persistStore } from "redux-persist";
import store from "./store";
import { PersistGate } from "redux-persist/integration/react";
import KassenzeichenViewer from "./app/components/KassenzeichenViewer";
import VerdisOnlineLanding from "./app/components/VerdisOnlineLanding";
import "bootstrap/dist/css/bootstrap.min.css";
import Layout from "./app/components/Layout";

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement,
);

const persistor = persistStore(store);

const router = createHashRouter(
  [
    {
      path: "/",
      element: <VerdisOnlineLanding />,
    },
    {
      path: "/meinkassenzeichen/:layers?",
      element: <KassenzeichenViewer />,
    },
  ],
  {},
);

root.render(
  <StrictMode>
    <Provider store={store}>
      <TopicMapContextProvider
        referenceSystemDefinition={MappingConstants.proj4crs25832def}
        mapEPSGCode="25832"
        referenceSystem={MappingConstants.crs25832}
      >
        <PersistGate loading={null} persistor={persistor}>
          <Layout>
            <RouterProvider router={router} />
          </Layout>
        </PersistGate>
      </TopicMapContextProvider>
    </Provider>
  </StrictMode>,
);
