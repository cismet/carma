import { useEffect, useState } from "react";
import TopicMapContextProvider from "react-cismap/contexts/TopicMapContextProvider";
import { FeatureItemsProvider } from "@carma-appframeworks/portals";

import "bootstrap/dist/css/bootstrap.min.css";
import "leaflet/dist/leaflet.css";
import "react-bootstrap-typeahead/css/Typeahead.css";
import "react-cismap/topicMaps.css";
import Map from "./components/Map";
import { addTitleFlag } from "../helper/urlHelper";
import { fetchVorhabenGeoJson } from "../data/vorhabenGeoJson";
import { vorhabenItemsConfig } from "../data/vorhabenItems";

const APP_KEY = "VorhabenkarteWuppertal2026";

const VORHABENKARTE_STYLE_URL =
  "https://tiles.cismet.de/vorhabenkarte/style.json";

export function App() {
  const [vorhaben, setVorhaben] = useState<GeoJSON.FeatureCollection | null>(
    null
  );

  useEffect(() => {
    document.title = "Vorhabenkarte Wuppertal";
    addTitleFlag();
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchVorhabenGeoJson()
      .then((collection) => {
        if (!cancelled) {
          setVorhaben(collection);
        }
      })
      .catch((error) => {
        console.error("[VORHABEN DATA] loading failed", error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    // itemFilterFunction only makes react-cismap's DefaultSettingsPanel show its
    // "Titel bei individueller Filterung anzeigen" checkbox (it reads the flag
    // from FeatureCollectionContext); no features go through it.
    <TopicMapContextProvider
      appKey={APP_KEY}
      infoBoxPixelWidth={350}
      itemFilterFunction={() => () => true}
    >
      <FeatureItemsProvider
        appKey={APP_KEY}
        collection={vorhaben}
        config={vorhabenItemsConfig}
      >
        <Map styleUrl={VORHABENKARTE_STYLE_URL} />
      </FeatureItemsProvider>
    </TopicMapContextProvider>
  );
}

export default App;
