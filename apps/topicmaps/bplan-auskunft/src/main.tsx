import { StrictMode } from "react";
import * as ReactDOM from "react-dom/client";
import {
  BrowserRouter,
  RouterProvider,
  createHashRouter,
} from "react-router-dom";

import Docviewer from "./app/Docviewer";
import { PersistGate } from "redux-persist/integration/react";
import { Provider } from "react-redux";
import store from "./store";
import { persistStore } from "redux-persist";
import Map from "./app/components/Map";
import TopicMapContextProvider from "react-cismap/contexts/TopicMapContextProvider";
import convertItemToFeature from "./utils/convertItemToFeature";
import { MappingConstants } from "react-cismap";
import { GazDataProvider, SelectionProvider } from "@carma-apps/portals";
import { gazDataConfig } from "./config/gazData";

const persistor = persistStore(store);

const router = createHashRouter(
  [
    {
      path: "/docs/:docPackageId?/:file?/:page?",
      element: <Docviewer />,
    },
    {
      path: "/",
      element: <Map />,
    },
  ],
  {}
);

const originalWarn = console.warn.bind(console);
const originalError = console.error.bind(console);
console.warn = (message, ...args) => {
  if (
    !message.includes("ReactDOM.render is no longer supported in React 18") &&
    !message.includes("Legacy context API has been detected")
  ) {
    originalWarn(message, ...args);
  }
};
console.error = (message, ...args) => {
  if (
    !message.includes("ReactDOM.render is no longer supported in React 18") &&
    !message.includes("Legacy context API has been detected")
  ) {
    originalError(message, ...args);
  }
};

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);

root.render(
  <StrictMode>
    <Provider store={store}>
      <GazDataProvider config={gazDataConfig}>
        <SelectionProvider>
          <TopicMapContextProvider
            convertItemToFeature={convertItemToFeature}
            referenceSystemDefinition={MappingConstants.proj4crs25832def}
            mapEPSGCode="25832"
            referenceSystem={MappingConstants.crs25832}
          >
            <PersistGate loading={null} persistor={persistor}>
              <RouterProvider router={router} />
            </PersistGate>
          </TopicMapContextProvider>
        </SelectionProvider>
      </GazDataProvider>
    </Provider>
  </StrictMode>
);
