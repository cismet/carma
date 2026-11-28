import { readLeafletHomeViewState } from "@carma-mapping/engines-interop/view-state";
import { readCesiumCameraStateFromViewState } from "@carma-mapping/engines-interop/view-state/cesium";

import { AnnotationsRuntimePage } from "./components/AnnotationsRuntimePage";
import { HOME_VIEW } from "./config";
const HOME_CAMERA_STATE = readCesiumCameraStateFromViewState(
  readLeafletHomeViewState(HOME_VIEW, {
    sourceId: "annotations-playground/default-home",
  })
);

export const App = () => (
  <AnnotationsRuntimePage homeCameraState={HOME_CAMERA_STATE} />
);
