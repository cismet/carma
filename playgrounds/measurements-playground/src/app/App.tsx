import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import { suppressReactCismapErrors } from "@carma-commons/utils";
import {
  MeasurementControl,
  MapMeasurementsObjects,
} from "@carma-commons/measurements";
import { ZoomControl } from "@carma-mapping/components";
import { Control, ControlLayout } from "@carma-mapping/map-controls-layout";
import { EmptySearchComponent } from "@carma-mapping/fuzzy-search";
import { LibFuzzySearch } from "@carma-mapping/fuzzy-search";
import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";
import { useContext } from "react";
import {
  TopicMapSelectionContent,
  useSelectionTopicMap,
  useSelection,
} from "@carma-appframeworks/portals";

suppressReactCismapErrors();

export function App() {
  const { responsiveState, gap, windowSize } = useContext<
    typeof ResponsiveTopicMapContext
  >(ResponsiveTopicMapContext);

  const { setSelection } = useSelection();
  useSelectionTopicMap();

  return (
    <div>
      <ControlLayout ifStorybook={false}>
        <Control position="topleft" order={10}>
          <ZoomControl />
        </Control>
        <MeasurementControl />
        <Control position="bottomleft" order={10}>
          <div style={{ marginTop: "4px" }}>
            <LibFuzzySearch
              pixelwidth={
                responsiveState === "normal" ? "300px" : windowSize.width - gap
              }
            />
          </div>
        </Control>
      </ControlLayout>
      <TopicMapComponent
        gazetteerSearchControl={true}
        gazetteerSearchComponent={EmptySearchComponent}
        locatorControl={false}
        fullScreenControl={false}
        zoomControls={false}
        leafletMapProps={{ editable: true }}
      >
        <MapMeasurementsObjects />
        <TopicMapSelectionContent />
      </TopicMapComponent>
    </div>
  );
}
