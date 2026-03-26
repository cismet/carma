import type { ObjectCentricCameraModel } from "@carma-commons/camera/model";
import type { Meters, Radians } from "@carma/units/types";

export type * from "./runtime";

export type { HashZoomConvention } from "./core/viewStateHash";

export type ShareableViewState = {
  // Canonical shared orbit pose (flattened):
  // - local basis follows the shared camera-model convention:
  //   +X east, +Y up, -Z north
  // - bearing starts at north and rotates positively toward east around +Y
  // - pitch is 0=nadir and +PI/2=horizon
  longitude: Radians;
  latitude: Radians;
  altitude: Meters;
  // Canonical projected zoom uses MapLibre/512px-tile semantics.
  zoom?: number;
  bearing: Radians;
  pitch: Radians;
  roll?: Radians;
  range: Meters;
  fovVertical?: Radians;
  fovHorizontal?: Radians;
  fovLongerEdge?: Radians;
  cameraModel?: ObjectCentricCameraModel;
};
