export type SceneViewStateAnchor = {
  lngDeg: number;
  latDeg: number;
  heightM: number;
};

export type SceneViewStateOrientation = {
  bearingRad?: number;
  pitchRad?: number;
  rollRad?: number;
  fovVerticalRad?: number;
  rangeM?: number;
};

export type SceneViewState = {
  anchor: SceneViewStateAnchor;
  orientation: SceneViewStateOrientation;
};
