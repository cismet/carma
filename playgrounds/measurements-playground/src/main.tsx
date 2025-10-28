import { StrictMode, useEffect, useState, createContext } from "react";
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

// Context for snapping control
export const SnappingContext = createContext<{
  snappingEnabled: boolean;
  setSnappingEnabled: (enabled: boolean) => void;
}>({
  snappingEnabled: true,
  setSnappingEnabled: () => {},
});

// Wrapper component to connect Redux to MapMeasurementsProvider
const MeasurementsProviderWrapper = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const uiMode = useSelector(getUIMode);
  const dispatch = useDispatch<AppDispatch>();
  const [snappingEnabled, setSnappingEnabled] = useState(true);

  const measurementsConfig = {
    // Only override what you want to change
    editableTitle: true,
    snappingEnabled: snappingEnabled,
    snappingOnUpdate: false,
    snappingRadiusVisible: true,
    debugOutputMapStatus: true,
    localStorageKey: "@MEASUREMENT_PLAYGROUNDY.app.measurements",

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
      <SnappingContext.Provider value={{ snappingEnabled, setSnappingEnabled }}>
        {children}
      </SnappingContext.Provider>
    </MapMeasurementsProvider>
  );
};

// Root component with drag-and-drop functionality
const RootComponent = () => {
  const [vectorStylesArray, setVectorStylesArray] = useState<any[]>(() => {
    // Load from localStorage on mount
    const saved = localStorage.getItem("measurements-vector-style");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Handle both old format (single object) and new format (array)
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch (e) {
        console.error("Failed to parse saved vector style:", e);
        return [];
      }
    }
    return [];
  });

  useEffect(() => {
    const handleDrop = async (event: DragEvent) => {
      event.preventDefault();

      const url = event.dataTransfer?.getData("URL");
      console.log("handleDrop", url);

      if (url) {
        try {
          // Fetch the content of the URL
          const response = await fetch(url);

          if (response.ok) {
            const contentType = response.headers.get("Content-Type");

            if (contentType?.includes("application/json")) {
              const jsonData = await response.json();
              console.log("JSON content fetched:", jsonData);

              // Add to existing layers instead of replacing
              setVectorStylesArray((prev) => {
                const updatedArray = [...prev, jsonData];
                // Save updated array to localStorage
                localStorage.setItem(
                  "measurements-vector-style",
                  JSON.stringify(updatedArray)
                );
                return updatedArray;
              });
            } else {
              console.warn("The content is not JSON");
            }
          } else {
            console.error("Failed to fetch the URL:", response.statusText);
          }
        } catch (error) {
          console.error("Error fetching URL:", error);
        }
      } else if (
        event.dataTransfer?.files &&
        event.dataTransfer.files.length > 0
      ) {
        // Handle file drop
        const file = event.dataTransfer.files[0]; // Get the first dropped file
        console.log("File dropped:", file.name, file);

        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            // Attempt to parse the file content as JSON
            const fileContent = e.target?.result;
            if (typeof fileContent === "string") {
              const processedContent = fileContent.replace(
                /__SERVER_URL__/g,
                "https://tiles.cismet.de"
              );

              const jsonData = JSON.parse(processedContent);
              console.log("Parsed JSON from file:", jsonData);

              // Add to existing layers instead of replacing
              setVectorStylesArray((prev) => {
                const updatedArray = [...prev, jsonData];
                // Save updated array to localStorage
                localStorage.setItem(
                  "measurements-vector-style",
                  JSON.stringify(updatedArray)
                );
                return updatedArray;
              });
            }
          } catch (error) {
            console.error("Failed to parse the file as JSON:", error);
          }
        };

        reader.readAsText(file); // Read the file as text
      }
    };

    const handleDragOver = (event: DragEvent) => {
      event.preventDefault();
    };

    window.addEventListener("drop", handleDrop);
    window.addEventListener("dragover", handleDragOver);

    return () => {
      window.removeEventListener("drop", handleDrop);
      window.removeEventListener("dragover", handleDragOver);
    };
  }, []);

  const clearAllVectorLayers = () => {
    setVectorStylesArray([]);
    localStorage.removeItem("measurements-vector-style");
  };

  return (
    <App
      vectorStyles={vectorStylesArray}
      onClearAllLayers={clearAllVectorLayers}
    />
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
                <RootComponent />
              </TopicMapContextProvider>
            </MeasurementsProviderWrapper>
          </SelectionProvider>
        </GazDataProvider>
      </PersistGate>
    </Provider>
  </StrictMode>
);
