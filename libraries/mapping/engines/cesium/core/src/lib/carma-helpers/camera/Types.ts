import type { Cartesian3 } from "@carma-cesium";
import type {
  CameraStateRecord,
  CapturedCameraState,
  CameraStateHeadingPitchRoll,
  CameraState,
} from "../../serialization";
export type CaptureCurrentCameraStateOptions = {
  includeFov?: boolean;
  includeOrientation?: boolean;
  includeCartographic?: boolean;
  includeMatrices?: boolean;
};

export type DirectionUp = {
  direction: Cartesian3;
  up: Cartesian3;
  right?: Cartesian3;
};

export type {
  CameraStateRecord,
  CapturedCameraState,
  CameraStateHeadingPitchRoll,
  CameraState,
};
