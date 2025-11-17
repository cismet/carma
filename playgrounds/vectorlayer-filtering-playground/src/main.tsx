import { StrictMode, useEffect, useState } from "react";
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
import {
  GazDataProvider,
  SelectionProvider,
} from "@carma-appframeworks/portals";
import { defaultLayerConf } from "react-cismap/tools/layerFactory";

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

const backgroundModes = [
  {
    title: "Stadtplan",
    mode: "default",
    layerKey: "stadtplan",
  },
  {
    title: "Stadtplan (Vektordaten )",
    mode: "default",
    layerKey: "vector2",
  },
  {
    title: "Stadtplan (Vektordaten light)",
    mode: "default",
    layerKey: "vector",
  },

  { title: "Luftbildkarte", mode: "default", layerKey: "lbk" },
];
const backgroundConfigurations = {
  lbk: {
    layerkey: "cismetText|trueOrtho2020@40",
    layerkey_: "wupp-plan-live@100|trueOrtho2020@75|rvrSchrift@100",
    src: "/images/rain-hazard-map-bg/ortho.png",
    title: "Luftbildkarte",
  },
  stadtplan: {
    layerkey: "wupp-plan-live@60",
    src: "/images/rain-hazard-map-bg/citymap.png",
    title: "Stadtplan",
  },
  vector: {
    layerkey: "cismetLight",
    src: "/images/rain-hazard-map-bg/citymap.png",
    title: "Stadtplan",
  },
  vector2: {
    layerkey: "OMT_OSM_bright",
    src: "/images/rain-hazard-map-bg/citymap.png",
    title: "Stadtplan",
  },
};
const baseLayerConf = { ...defaultLayerConf };

baseLayerConf.namedLayers.cismetLight = {
  type: "vector",
  style: "https://omt.map-hosting.de/styles/cismet-light/style.json",
  pane: "backgroundvectorLayers",
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
            <TopicMapContextProvider
              baseLayerConf={baseLayerConf}
              backgroundConfigurations={backgroundConfigurations}
              backgroundModes={backgroundModes}
            >
              <RootComponent />
            </TopicMapContextProvider>
          </SelectionProvider>
        </GazDataProvider>
      </PersistGate>
    </Provider>
  </StrictMode>
);
