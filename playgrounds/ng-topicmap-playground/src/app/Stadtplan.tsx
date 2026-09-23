import {
  SelectionProvider,
  ProgressIndicator,
  useProgress,
  GazDataProvider,
} from "@carma-appframeworks/portals";
import { SandboxedEvalProvider } from "@carma-commons/sandbox-eval";
import { CarmaMap } from "@carma-mapping/core";
import {
  LibreContextProvider,
  type LibreLayer,
} from "@carma-mapping/engines/maplibre";
import type { Map as MaplibreMap } from "maplibre-gl";
import TopicMapContextProvider from "react-cismap/contexts/TopicMapContextProvider";
import { defaultGazDataConfig } from "@carma-commons/resources";
import { backgroundModes, backgroundConfigurations } from "./backgroundConfig";
import Menu from "./Menu";
import "bootstrap/dist/css/bootstrap.min.css";
import "react-bootstrap-typeahead/css/Typeahead.css";
import "react-cismap/topicMaps.css";
import "leaflet/dist/leaflet.css";

// Module-level so the references stay stable across renders: new ones would
// make LibreMap rebuild the whole style on every re-render.
const LIBRE_LAYERS: LibreLayer[] = [
  {
    type: "geojson",
    name: "POIs",
    data: "https://tiles.cismet.de/poi/poi.json",
    infoboxMapping: [
      "foto: p.foto",
      "headerColor:p.schrift",
      "header:p.kombi",
      "title:p.geographicidentifier",
      "additionalInfo:p.adresse",
      "subtitle: p.info",
      "url:p.url",
      "tel:p.telefon",
      "email:p.email",
    ],
  },
];

const filterSchools = (map: MaplibreMap, layers?: LibreLayer[]) => {
  layers?.forEach((layer, index) => {
    if (layer.type === "geojson") {
      const sourceId = `geojson-source-${index}`;
      const styleSource = map.getStyle().sources[sourceId] as any;

      if (styleSource?.data?.features) {
        const filteredFeatures = styleSource.data.features.filter(
          (feature: any) => {
            const identifications = feature.properties?.identifications;
            if (!Array.isArray(identifications)) return true;
            return !identifications.some(
              (id: any) => id.identification === "Schule"
            );
          }
        );

        const source = map.getSource(sourceId);
        if (source && "setData" in source) {
          (source as any).setData({
            type: "FeatureCollection",
            features: filteredFeatures,
          });
        }
      }
    }
  });
};

export function Stadtplan() {
  const { progress, showProgress, handleProgressUpdate } = useProgress();

  return (
    <TopicMapContextProvider
      appKey="ng-topicmap-playground-stadtplan"
      infoBoxPixelWidth={350}
      backgroundModes={backgroundModes}
      backgroundConfigurations={backgroundConfigurations}
    >
      <SandboxedEvalProvider>
        <GazDataProvider config={defaultGazDataConfig}>
          <SelectionProvider>
            <LibreContextProvider>
              <ProgressIndicator progress={progress} show={showProgress} />
              <CarmaMap
                appKey="ng-topicmap-playground-stadtplan"
                mapEngine="maplibre"
                exposeMapToWindow
                overrideGlyphs="https://tiles.cismet.de/fonts/{fontstack}/{range}.pbf"
                onProgressUpdate={handleProgressUpdate}
                useRouting
                libreLayers={LIBRE_LAYERS}
                filterFunction={filterSchools}
                modalMenu={<Menu />}
              />
            </LibreContextProvider>
          </SelectionProvider>
        </GazDataProvider>
      </SandboxedEvalProvider>
    </TopicMapContextProvider>
  );
}
