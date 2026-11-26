import { useEffect, useState } from "react";
import TopicMapContextProvider from "react-cismap/contexts/TopicMapContextProvider";
import {
  FeatureItemsProvider,
  defaultBackgroundConfigurations,
  osmBackgroundConfiguration,
} from "@carma-appframeworks/portals";
import { CarmaLightBox } from "@carma-mapping/lightbox";

import "bootstrap/dist/css/bootstrap.min.css";
import "leaflet/dist/leaflet.css";
import "react-bootstrap-typeahead/css/Typeahead.css";
import "react-cismap/topicMaps.css";
import Map from "./components/Map";
import { addTitleFlag } from "../helper/urlHelper";
import { fetchVorhabenGeoJson } from "../data/vorhabenGeoJson";
import { vorhabenItemsConfig } from "../data/vorhabenItems";

const VORHABENKARTE_STYLE_URL =
  "https://tiles.cismet.de/vorhabenkarte/style.json";

// Stadtplan (Tag) and (Nacht) are the vector Stadtplan styles from tiles.cismet.de/stadtplan
const BACKGROUND_CONFIGURATIONS = {
  ...defaultBackgroundConfigurations,
  ...osmBackgroundConfiguration,
  stadtplan: {
    layerkey: "stadtplan_vector@100",
    src: "/images/rain-hazard-map-bg/citymap.png",
    title: "Stadtplan",
  },
  stadtplanNacht: {
    layerkey: "stadtplan_nacht@100",
    src: "/images/rain-hazard-map-bg/citymap.png",
    title: "Stadtplan",
  },
};

const BACKGROUND_MODES = [
  { title: "Stadtplan (Tag)", mode: "default", layerKey: "stadtplan" },
  { title: "Stadtplan (Nacht)", mode: "night", layerKey: "stadtplanNacht" },
  { title: "OpenStreetMap", mode: "default", layerKey: "osm" },
  { title: "Luftbildkarte", mode: "default", layerKey: "lbk" },
];

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
      appKey="VorhabenkarteWuppertal2026"
      infoBoxPixelWidth={350}
      itemFilterFunction={() => () => true}
      backgroundConfigurations={BACKGROUND_CONFIGURATIONS}
      backgroundModes={BACKGROUND_MODES}
    >
      <FeatureItemsProvider
        appKey="VorhabenkarteWuppertal2026"
        collection={vorhaben}
        config={vorhabenItemsConfig}
      >
        <CarmaLightBox>
          <Map styleUrl={VORHABENKARTE_STYLE_URL} />
        </CarmaLightBox>
      </FeatureItemsProvider>
    </TopicMapContextProvider>
  );
}

export default App;
