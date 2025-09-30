import { StrictMode } from "react";
import * as ReactDOM from "react-dom/client";
import { Provider } from "react-redux";
import { TopicMapContextProvider } from "react-cismap/contexts/TopicMapContextProvider";
import store from "./app/store";

import { App } from "./app/App";

import "./styles.css";
import "bootstrap/dist/css/bootstrap.min.css";
import "react-bootstrap-typeahead/css/Typeahead.css";
import "leaflet/dist/leaflet.css";
import { PersistGate } from "redux-persist/integration/react";
import { persistStore } from "redux-persist";

const persistor = persistStore(store);

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);
root.render(
  <StrictMode>
    <Provider store={store}>
      <PersistGate loading={null} persistor={persistor}>
        <TopicMapContextProvider>
          <App />
        </TopicMapContextProvider>
      </PersistGate>
    </Provider>
  </StrictMode>
);
