import { degToRadNumeric } from "@carma/units/helpers";
import type { Meters, Radians } from "@carma/units/types";

export const APP_BASE_PATH = import.meta.env.BASE_URL;
export const CESIUM_PATHNAME = "__cesium__";

export type AnnotationsDemoCameraState = {
  longitude: Radians;
  latitude: Radians;
  altitude: Meters;
  heading: Radians;
  pitch: Radians;
  roll: Radians;
};

export const ANNOTATIONS_DEMO_HOME_CAMERA_STATE: AnnotationsDemoCameraState = {
  longitude: degToRadNumeric(7.199918031692506) as Radians,
  latitude: degToRadNumeric(51.272570027476256) as Radians,
  altitude: 650 as Meters,
  heading: degToRadNumeric(0) as Radians,
  pitch: degToRadNumeric(-45) as Radians,
  roll: 0 as Radians,
};
