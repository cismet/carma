import { useState } from "react";

import { AnnotationsRuntimeV1Page } from "./components/AnnotationsRuntimeV1Page";
import { AnnotationsRuntimeV2Page } from "./components/AnnotationsRuntimeV2Page";
import { PlaygroundControls } from "./components/PlaygroundControls";
import type { PlaygroundRuntime } from "./playground.types";

export const App = () => {
  const [runtimeVersion, setRuntimeVersion] = useState<PlaygroundRuntime>("v2");

  return (
    <>
      <PlaygroundControls
        runtimeVersion={runtimeVersion}
        onRuntimeVersionChange={setRuntimeVersion}
      />
      {runtimeVersion === "v2" ? (
        <AnnotationsRuntimeV2Page />
      ) : (
        <AnnotationsRuntimeV1Page />
      )}
    </>
  );
};
