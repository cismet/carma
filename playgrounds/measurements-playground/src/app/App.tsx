import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import { suppressReactCismapErrors } from "@carma-commons/utils";
import { MeasurementControl, MapObjects } from "@carma-commons/measurements";
import { ZoomControl } from "@carma-mapping/components";
import {
  Control,
  ControlLayout,
} from "@carma-mapping/map-controls-layout";
import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch } from "./store";
import { setDrawingShape } from "./store/slices/measurements";
import { getUIMode, toggleUIMode, UIMode } from "./store/slices/ui";

suppressReactCismapErrors();

export function App() {
  const dispatch = useDispatch<AppDispatch>();
  const mode = useSelector(getUIMode);

  const isModeMeasurement = mode === UIMode.MEASUREMENT;

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
      </ControlLayout>
      <TopicMapComponent
        gazetteerSearchComponent={<></>}
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
