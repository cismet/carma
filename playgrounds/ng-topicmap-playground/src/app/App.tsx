import { CarmaMap } from "@carma-appframeworks/portals";
import {
  GazDataProvider,
  SelectionProvider,
} from "@carma-appframeworks/portals";
import { ControlLayout } from "@carma-mapping/map-controls-layout";
import TopicMapContextProvider from "react-cismap/contexts/TopicMapContextProvider";
import { defaultGazDataConfig } from "@carma-commons/resources";
import Menu from "./Menu";
import "bootstrap/dist/css/bootstrap.min.css";
import "react-bootstrap-typeahead/css/Typeahead.css";
import "react-cismap/topicMaps.css";
import "leaflet/dist/leaflet.css";

export function App() {
  return (
    <TopicMapContextProvider infoBoxPixelWidth={350}>
      <GazDataProvider config={defaultGazDataConfig}>
        <SelectionProvider>
          <CarmaMap
            onClick={() => {}}
            mapEngine="maplibre"
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
            // vectorStyles={[
            //   {
            //     name: "POIs",
            //     style: "https://tiles.cismet.de/poi/style.json",
            //     infoboxMapping: [
            //       "foto: p.foto",
            //       "headerColor:p.schrift",
            //       "header:p.kombi",
            //       "title:p.geographicidentifier",
            //       "additionalInfo:p.adresse",
            //       "subtitle: p.info",
            //       "url:p.url",
            //       "tel:p.telefon",
            //       "email:p.email",
            //     ],
            //   },
            // ]}
            modalMenu={<Menu />}
          />
        </SelectionProvider>
      </GazDataProvider>
    </TopicMapContextProvider>
  );
}
