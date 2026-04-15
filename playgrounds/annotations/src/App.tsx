import {
  readCesiumCameraStateFromViewState,
  readLeafletHomeViewState,
} from "@carma-mapping/engines-interop/view-state";

import { AnnotationsRuntimePrototypePage } from "./components/AnnotationsRuntimePrototypePage";
import { AnnotationsRuntimePage } from "./components/AnnotationsRuntimePage";
import { HOME_VIEW } from "./config";
import { readInitialRuntimeVersion } from "./playgroundConfig";
const HOME_CAMERA_STATE = readCesiumCameraStateFromViewState(
  readLeafletHomeViewState(HOME_VIEW, {
    sourceId: "annotations-playground/default-home",
  })
);

export const App = () => {
  const runtimeVersion = readInitialRuntimeVersion();

  return runtimeVersion === "runtime" ? (
    <AnnotationsRuntimePage homeCameraState={HOME_CAMERA_STATE} />
  ) : (
    <AnnotationsRuntimePrototypePage homeCameraState={HOME_CAMERA_STATE} />
  );
};
