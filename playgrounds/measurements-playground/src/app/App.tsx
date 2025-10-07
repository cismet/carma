import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import { suppressReactCismapErrors } from "@carma-commons/utils";
import {
  MapMeasurementLib,
  InfoBoxMeasurement,
} from "@carma-commons/measurements";
import { ZoomControl } from "@carma-mapping/components";
import {
  Control,
  ControlLayout,
  ControlButtonStyler,
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
  const getUrlPrefix = () => window.location.origin + window.location.pathname;

  return (
    <>
      <ControlLayout ifStorybook={false}>
        <Control position="topleft" order={10}>
          <ZoomControl />
        </Control>
        <Control position="topleft" order={10}>
          <ControlButtonStyler
            onClick={() => {
              if (!isModeMeasurement) {
                dispatch(setDrawingShape(false));
              }
              dispatch(toggleUIMode(UIMode.MEASUREMENT));
            }}
          >
            <img
              src={`${getUrlPrefix()}${
                isModeMeasurement ? "measure-active.png" : "measure.png"
              }`}
              alt="Measure"
              className="w-6"
            />
          </ControlButtonStyler>
        </Control>
        {isModeMeasurement && <InfoBoxMeasurement />}
      </ControlLayout>
      <TopicMapComponent
        gazetteerSearchComponent={<></>}
        locatorControl={false}
        fullScreenControl={false}
        zoomControls={false}
        leafletMapProps={{ editable: true }}
      >
        <MapMeasurementLib mode={mode} />
      </TopicMapComponent>
    </>
  );
}
