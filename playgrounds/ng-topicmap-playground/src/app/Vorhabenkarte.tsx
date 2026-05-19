import {
  SelectionProvider,
  ProgressIndicator,
  useProgress,
  GazDataProvider,
} from "@carma-appframeworks/portals";
import { SandboxedEvalProvider } from "@carma-commons/sandbox-eval";
import { CarmaMap } from "@carma-mapping/core";
import { LibreContextProvider } from "@carma-mapping/engines/maplibre";
import TopicMapContextProvider from "react-cismap/contexts/TopicMapContextProvider";
import { defaultGazDataConfig } from "@carma-commons/resources";
import {
  backgroundModes,
  backgroundConfigurations,
} from "./backgroundConfig";
import Menu from "./Menu";
import "bootstrap/dist/css/bootstrap.min.css";
import "react-bootstrap-typeahead/css/Typeahead.css";
import "react-cismap/topicMaps.css";
import "leaflet/dist/leaflet.css";

const VORHABENKARTE_STYLE_URL = `${import.meta.env.BASE_URL}vorhabenkarte/style.json`;

export function Vorhabenkarte() {
  const { progress, showProgress, handleProgressUpdate } = useProgress();

  return (
    <TopicMapContextProvider
      appKey="ng-topicmap-playground-vorhabenkarte"
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
                appKey="ng-topicmap-playground-vorhabenkarte"
                mapEngine="maplibre"
                exposeMapToWindow
                overrideGlyphs="https://tiles.cismet.de/fonts/{fontstack}/{range}.pbf"
                onProgressUpdate={handleProgressUpdate}
                libreLayers={[
                  {
                    type: "vector",
                    name: "Vorhaben",
                    style: VORHABENKARTE_STYLE_URL,
                  },
                  {
                    type: "geojson",
                    name: "Vorhaben Points",
                    data: "https://tiles.cismet.de/vorhabenkarte/vorhabenPoints.json",
                    colorProperty: "thema_farbe",
                    promoteId: "fid",
                  },
                ]}
                modalMenu={<Menu />}
              />
            </LibreContextProvider>
          </SelectionProvider>
        </GazDataProvider>
      </SandboxedEvalProvider>
    </TopicMapContextProvider>
  );
}
