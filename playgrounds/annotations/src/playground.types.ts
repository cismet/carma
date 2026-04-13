import { type CameraStateRecord } from "@carma-mapping/engines/cesium/core";

export type PlaygroundRuntime = "v1" | "v2";

export type AnnotationsDemoCameraState = CameraStateRecord;

export type PlaygroundRuntimePageProps = {
  homeCameraState: AnnotationsDemoCameraState;
};
