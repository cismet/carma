import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import { suppressReactCismapErrors } from "@carma-commons/utils";
import { MeasurementControl, MapObjects } from "@carma-commons/measurements";
import { ZoomControl } from "@carma-mapping/components";
import { Control, ControlLayout } from "@carma-mapping/map-controls-layout";
import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch } from "./store";
import { setDrawingShape } from "./store/slices/measurements";
import { getUIMode, toggleUIMode, UIMode } from "./store/slices/ui";
import { EmptySearchComponent } from "@carma-mapping/fuzzy-search";
import { LibFuzzySearch } from "@carma-mapping/fuzzy-search";
import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";
import { useContext } from "react";

suppressReactCismapErrors();

export function App() {
  const dispatch = useDispatch<AppDispatch>();
  const mode = useSelector(getUIMode);

  const isModeMeasurement = mode === UIMode.MEASUREMENT;

  const { responsiveState, gap, windowSize } = useContext<
    typeof ResponsiveTopicMapContext
  >(ResponsiveTopicMapContext);

  return (
    <>
      <ControlLayout ifStorybook={false}>
        <Control position="topleft" order={10}>
          <ZoomControl />
        </Control>
        <MeasurementControl
          isActive={isModeMeasurement}
          onToggle={() => {
            if (!isModeMeasurement) {
              dispatch(setDrawingShape(false));
            }
            dispatch(toggleUIMode(UIMode.MEASUREMENT));
          }}
        />
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
        gazetteerSearchComponent={<EmptySearchComponent />}
        locatorControl={false}
        fullScreenControl={false}
        zoomControls={false}
        leafletMapProps={{ editable: true }}
      >
        <MapObjects mode={mode} />
      </TopicMapComponent>
    </>
  );
}
