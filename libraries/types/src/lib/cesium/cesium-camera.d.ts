import { Degrees } from "../units";

export type CameraPositionAndOrientation = {
  position: Cartesian3;
  up: Cartesian3;
  direction: Cartesian3;
};

export type CameraPosePlain = {
  longitude: number;
  latitude: number;
  height: number;
  heading: number;
  pitch: number;
};

export type CameraPoseDegrees = {
  longitude: Degrees;
  latitude: Degrees;
  height: Meters;
  heading: Degrees;
  pitch: Degrees;
};

export type CameraPoseRadians = {
  longitude: Radians;
  latitude: Radians;
  height: Meters;
  heading: Radians;
  pitch: Radians;
};

// for hahs handler
export type CameraState = {
  position: Cartographic;
  heading?: number;
  pitch?: number;
  fov?: number;
};

export type StringifiedCameraState = { key: string; value: string }[];

export namespace CameraPose {
  export type Plain = CameraPosePlain;
  export type Deg = CameraPoseDegrees;
  export type Rad = CameraPoseRadians;
}
