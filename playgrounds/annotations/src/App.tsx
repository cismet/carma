import { useState } from "react";

import { AnnotationsRuntimeV1Page } from "./components/AnnotationsRuntimeV1Page";
import { AnnotationsRuntimeV2Page } from "./components/AnnotationsRuntimeV2Page";
import { PlaygroundControls } from "./components/PlaygroundControls";
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

  return (
    <>
      <PlaygroundControls
        runtimeVersion={runtimeVersion}
        onRuntimeVersionChange={handleRuntimeVersionChange}
      />
      {runtimeVersion === "v2" ? (
        <AnnotationsRuntimeV2Page />
      ) : (
        <AnnotationsRuntimeV1Page />
      )}
    </>
  );
};
