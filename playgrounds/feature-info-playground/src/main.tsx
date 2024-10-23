import { StrictMode } from "react";
import * as ReactDOM from "react-dom/client";
import TopicMapContextProvider from "react-cismap/contexts/TopicMapContextProvider";
import { PersistGate } from "redux-persist/integration/react";
import { persistStore } from "redux-persist";
import { Provider } from "react-redux";
import { MappingConstants } from "react-cismap";

import App from "./app/App";
import store from "./app/store";

const persistor = persistStore(store);

const originalWarn = console.warn.bind(console);
const originalError = console.error.bind(console);
console.warn = (message, ...args) => {
  if (
    message &&
    !message.includes("ReactDOM.render is no longer supported in React 18") &&
    !message.includes("Legacy context API has been detected")
  ) {
    originalWarn(message, ...args);
  }
};
console.error = (message, ...args) => {
  if (
    message &&
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
      <TopicMapContextProvider
        referenceSystem={MappingConstants.crs3857}
        referenceSystemDefinition={MappingConstants.proj4crs3857def}
      >
        <PersistGate loading={null} persistor={persistor}>
          <App />
        </PersistGate>
      </TopicMapContextProvider>
    </Provider>
  </StrictMode>
);
