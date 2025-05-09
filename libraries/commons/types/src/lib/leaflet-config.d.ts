export type ZoomIncrements =
  | 0
  | 1
  | 0.5
  | 0.25
  | 0.125
  | 0.0625
  | 0.03125
  | 0.015625; // fractions of 1/2^n to reduce resize artifacts.

export type LeafletConfig = {
  zoomSnap: ZoomIncrements;
  zoomDelta: ZoomIncrements;
};
