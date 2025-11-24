import { CarmaMap } from "@carma-appframeworks/portals";
import {
  GazDataProvider,
  SelectionProvider,
} from "@carma-appframeworks/portals";
import { ControlLayout } from "@carma-mapping/map-controls-layout";
import TopicMapContextProvider from "react-cismap/contexts/TopicMapContextProvider";
import { defaultGazDataConfig } from "@carma-commons/resources";

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
                },
              ]}
            />
          </ControlLayout>
        </SelectionProvider>
      </GazDataProvider>
    </TopicMapContextProvider>
  );
}
