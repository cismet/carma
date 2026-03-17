import { useState } from "react";

import { AnnotationsRuntimeV1Page } from "./components/AnnotationsRuntimeV1Page";
import { AnnotationsRuntimeV2Page } from "./components/AnnotationsRuntimeV2Page";
import {
  persistRuntimeVersion,
  readInitialRuntimeVersion,
} from "./playgroundConfig";
import type { PlaygroundRuntime } from "./playground.types";

export const App = () => {
  const [runtimeVersion, setRuntimeVersion] = useState<PlaygroundRuntime>(
    () => readInitialRuntimeVersion()
  );

  const handleRuntimeVersionChange = (nextRuntimeVersion: PlaygroundRuntime) => {
    setRuntimeVersion(nextRuntimeVersion);
    persistRuntimeVersion(nextRuntimeVersion);
  };

  return runtimeVersion === "v2" ? (
    <AnnotationsRuntimeV2Page
      runtimeVersion={runtimeVersion}
      onRuntimeVersionChange={handleRuntimeVersionChange}
    />
  ) : (
    <AnnotationsRuntimeV1Page
      runtimeVersion={runtimeVersion}
      onRuntimeVersionChange={handleRuntimeVersionChange}
    />
  );
};
