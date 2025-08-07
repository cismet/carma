export type ObliqueConfig = {
  uri: string; // Base URI for the imagery
  exteriorOrientations: {
    crs: string;
    uri: string; // URI for the exterior orientations metadata json
  };
  interiorOrientations: Record<string, InteriorOrientationCalibrationData>;
  upMatrixMapping: Record<string, { rowIndex: number; negate: boolean }>;
};

export type InteriorOrientationCalibrationData = {
  principalPointX: number;
  principalPointY: number;
  columns: number; // sensor width in pixels
  rows: number; // sensor height in pixels
  focalLength: number; // nominally 110mm
  ppmm: number; // pixels per mm ; equals 1/ Pixel size 3.76µm
  label?: string; // label for the camera
  model: SensorSpecs; // camera model
  CCD_INTERIOR_ORIENTATION: [
    [number, number, number],
    [number, number, number]
  ]; // CCD interior orientation matrix as is from CAMERA_DEFINTION
};

export type SensorSpecs = {
  name: string; // camera model
  columns: number; // sensor width in pixels
  rows: number; // sensor height in pixels
  ppmm: number; // pixels per mm ; equals 1/ Pixel size 3.76µm
};
