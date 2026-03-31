import { useState } from "react";

import {
  readCesiumCameraStateFromViewState,
  readLeafletHomeViewState,
} from "@carma-mapping/engines-interop/view-state";

import { AnnotationsRuntimeV1Page } from "./components/AnnotationsRuntimeV1Page";
import { AnnotationsRuntimeV2Page } from "./components/AnnotationsRuntimeV2Page";
import { HOME_VIEW } from "./config";
import type { PlaygroundRuntime } from "./playground.types";
import {
  persistRuntimeVersion,
  readInitialRuntimeVersion,
} from "./playgroundConfig";
const HOME_CAMERA_STATE = readCesiumCameraStateFromViewState(
  readLeafletHomeViewState(HOME_VIEW, {
    sourceId: "annotations-playground/default-home",
  })
);

export const App = () => {
  const [runtimeVersion, setRuntimeVersion] = useState<PlaygroundRuntime>(() =>
    readInitialRuntimeVersion()
  );

  const handleRuntimeVersionChange = (
    nextRuntimeVersion: PlaygroundRuntime
  ) => {
    setRuntimeVersion(nextRuntimeVersion);
    persistRuntimeVersion(nextRuntimeVersion);
  };

  return runtimeVersion === "v2" ? (
    <AnnotationsRuntimeV2Page
      runtimeVersion={runtimeVersion}
      onRuntimeVersionChange={handleRuntimeVersionChange}
      homeCameraState={HOME_CAMERA_STATE}
    />
  ) : (
    <AnnotationsRuntimeV1Page
      runtimeVersion={runtimeVersion}
      onRuntimeVersionChange={handleRuntimeVersionChange}
      homeCameraState={HOME_CAMERA_STATE}
    />
  );
};
