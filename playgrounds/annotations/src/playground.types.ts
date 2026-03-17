export type PlaygroundRuntime = "v1" | "v2";

export type PlaygroundRuntimePageProps = {
  runtimeVersion: PlaygroundRuntime;
  onRuntimeVersionChange: (value: PlaygroundRuntime) => void;
};
