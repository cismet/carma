import { StrictMode } from "react";
import * as ReactDOM from "react-dom/client";
import { persistStore } from "redux-persist";
import { PersistGate } from "redux-persist/integration/react";
import { Provider } from "react-redux";
import { suppressReactCismapErrors } from "@carma-commons/utils";

import App from "./app/App.jsx";
import store from "./app/store/index.js";

const persistor = persistStore(store);

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);
suppressReactCismapErrors();

root.render(
  <StrictMode>
    <Provider store={store}>
      <PersistGate loading={null} persistor={persistor}>
        <App />
      </PersistGate>
    </Provider>
  </StrictMode>
);
