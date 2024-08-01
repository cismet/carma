import { Map } from "./components/Map";
import store from "./store";
import * as sliceUI from "./store/slices/ui";
import * as sliceLayers from "./store/slices/layers";
import * as sliceMapping from "./store/slices/mapping";
import * as sliceMeasure from "./store/slices/measurements";
import * as utils from "./utils/helper";
import * as layer from "./utils/layer";
export * from "./types";

import TopNavbar from "./components/TopNavbar";
import MapMeasurement from "./components/map-measure/MapMeasurement";
import HomeButton from "./components/HomeButton";
import type { Settings } from "./components/Share";

export {
  Map,
  layer,
  sliceLayers,
  sliceMapping,
  sliceMeasure,
  sliceUI,
  store,
  utils,
  HomeButton,
  MapMeasurement,
  TopNavbar,
};

export type { Settings };

export default Map;
