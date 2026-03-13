import { useControls } from "leva";

import type { PlaygroundRuntime } from "../playground.types";

type PlaygroundControlsProps = {
  runtimeVersion: PlaygroundRuntime;
  onRuntimeVersionChange: (value: PlaygroundRuntime) => void;
};

export const PlaygroundControls = ({
  runtimeVersion,
  onRuntimeVersionChange,
}: PlaygroundControlsProps) => {
  useControls("Playground", {
    runtime: {
      options: {
        "runtime-v1": "v1",
        "runtime-v2": "v2",
      } as const,
      value: runtimeVersion,
      onChange: (value: PlaygroundRuntime) => onRuntimeVersionChange(value),
    },
    mode: {
      value: "annotations",
      disabled: true,
    },
  });

  return null;
};
