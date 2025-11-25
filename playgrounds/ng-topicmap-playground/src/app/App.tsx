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

export function App() {
  return (
    <TopicMapContextProvider infoBoxPixelWidth={350}>
      <GazDataProvider config={defaultGazDataConfig}>
        <SelectionProvider>
          <ControlLayout ifStorybook={false}>
            <CarmaMap
              onClick={() => {}}
              mapEngine="maplibre"
              vectorStyles={[
                {
                  name: "POIs",
                  style: "https://tiles.cismet.de/poi/style.json",
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
              modalMenu={<Menu />}
            />
          </ControlLayout>
        </SelectionProvider>
      </GazDataProvider>
    </TopicMapContextProvider>
  );
}
