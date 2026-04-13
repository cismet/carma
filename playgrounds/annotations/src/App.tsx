import {
  readCesiumCameraStateFromViewState,
  readLeafletHomeViewState,
} from "@carma-mapping/engines-interop/view-state";

import { AnnotationsRuntimeV1Page } from "./components/AnnotationsRuntimeV1Page";
import { AnnotationsRuntimeV2Page } from "./components/AnnotationsRuntimeV2Page";
import { HOME_VIEW } from "./config";
import { readInitialRuntimeVersion } from "./playgroundConfig";
const HOME_CAMERA_STATE = readCesiumCameraStateFromViewState(
  readLeafletHomeViewState(HOME_VIEW, {
    sourceId: "annotations-playground/default-home",
  })
);

export const App = () => {
  const runtimeVersion = readInitialRuntimeVersion();

  return runtimeVersion === "v2" ? (
    <AnnotationsRuntimeV2Page homeCameraState={HOME_CAMERA_STATE} />
  ) : (
    <AnnotationsRuntimeV1Page homeCameraState={HOME_CAMERA_STATE} />
  );
};
