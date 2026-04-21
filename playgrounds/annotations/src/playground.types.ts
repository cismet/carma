import { type CameraStateRecord } from "@carma-mapping/engines/cesium/core";

export type AnnotationsDemoCameraState = CameraStateRecord;

export type PlaygroundRuntimePageProps = {
  homeCameraState: AnnotationsDemoCameraState;
};
