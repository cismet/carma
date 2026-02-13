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
import Menu from "./Menu";
import "bootstrap/dist/css/bootstrap.min.css";
import "react-bootstrap-typeahead/css/Typeahead.css";
import "react-cismap/topicMaps.css";
import "leaflet/dist/leaflet.css";

export function Stadtplan() {
  const { progress, showProgress, handleProgressUpdate } = useProgress();

  return (
    <TopicMapContextProvider infoBoxPixelWidth={350}>
      <SandboxedEvalProvider>
        <GazDataProvider config={defaultGazDataConfig}>
          <SelectionProvider>
            <LibreContextProvider>
              <ProgressIndicator progress={progress} show={showProgress} />
              <CarmaMap
                onClick={() => {}}
                mapEngine="maplibre"
                exposeMapToWindow
                overrideGlyphs="https://tiles.cismet.de/fonts/{fontstack}/{range}.pbf"
                onProgressUpdate={handleProgressUpdate}
                libreLayers={[
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
                ]}
                filterFunction={(map, layers) => {
                  layers?.forEach((layer, index) => {
                    if (layer.type === "geojson") {
                      const sourceId = `geojson-source-${index}`;
                      const styleSource = map.getStyle().sources[
                        sourceId
                      ] as any;

                      if (styleSource?.data?.features) {
                        const filteredFeatures =
                          styleSource.data.features.filter((feature: any) => {
                            const identifications =
                              feature.properties?.identifications;
                            if (!Array.isArray(identifications)) return true;
                            return !identifications.some(
                              (id: any) => id.identification === "Schule"
                            );
                          });

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
                }}
                modalMenu={<Menu />}
              />
            </LibreContextProvider>
          </SelectionProvider>
        </GazDataProvider>
      </SandboxedEvalProvider>
    </TopicMapContextProvider>
  );
}
