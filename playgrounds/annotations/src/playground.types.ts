import { type CameraStateRecord } from "@carma-mapping/engines/cesium/core";

export type PlaygroundRuntime = "prototype" | "runtime";

export type AnnotationsDemoCameraState = CameraStateRecord;

export type PlaygroundRuntimePageProps = {
  homeCameraState: AnnotationsDemoCameraState;
};
