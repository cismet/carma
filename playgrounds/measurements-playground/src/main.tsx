import { StrictMode } from "react";
import * as ReactDOM from "react-dom/client";
import { Provider, useSelector, useDispatch } from "react-redux";
import { TopicMapContextProvider } from "react-cismap/contexts/TopicMapContextProvider";
import store from "./app/store";
import type { AppDispatch } from "./app/store";

import { App } from "./app/App";

import "./styles.css";
import "bootstrap/dist/css/bootstrap.min.css";
import "react-bootstrap-typeahead/css/Typeahead.css";
import "leaflet/dist/leaflet.css";
import { PersistGate } from "redux-persist/integration/react";
import { persistStore } from "redux-persist";
import {
  MapMeasurementsProvider,
  MEASUREMENT_MODE,
} from "@carma-commons/measurements";
import {
  GazDataProvider,
  SelectionProvider,
} from "@carma-appframeworks/portals";
import { getUIMode, setUIMode, UIMode } from "./app/store/slices/ui";

// Wrapper component to connect Redux to MapMeasurementsProvider
const MeasurementsProviderWrapper = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const uiMode = useSelector(getUIMode);
  const dispatch = useDispatch<AppDispatch>();
  const measurementsConfig = {
    // Only override what you want to change
    editableTitle: true,
    // infoBoxHeaderColor: "#22c55e",
  };

  const mode =
    uiMode === UIMode.MEASUREMENT
      ? MEASUREMENT_MODE.MEASUREMENT
      : MEASUREMENT_MODE.DEFAULT;
  const handleSetMode = (newMode: MEASUREMENT_MODE) => {
    const newUIMode =
      newMode === MEASUREMENT_MODE.MEASUREMENT
        ? UIMode.MEASUREMENT
        : UIMode.DEFAULT;
    dispatch(setUIMode(newUIMode));
  };

  return (
    <MapMeasurementsProvider
      externalMode={mode}
      setModeExternal={handleSetMode}
      // Skip config if you want to use default values
      config={measurementsConfig}
    >
      {children}
    </MapMeasurementsProvider>
  );
};

const persistor = persistStore(store);

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);
root.render(
  <StrictMode>
    <Provider store={store}>
      <PersistGate loading={null} persistor={persistor}>
        <GazDataProvider>
          <SelectionProvider>
            <MeasurementsProviderWrapper>
              <TopicMapContextProvider>
                <App />
              </TopicMapContextProvider>
            </MeasurementsProviderWrapper>
          </SelectionProvider>
        </GazDataProvider>
      </PersistGate>
    </Provider>
  </StrictMode>
);
