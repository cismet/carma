import {
  InteriorOrientationCalibrationData,
  ObliqueConfig,
  SensorSpecs,
} from "../oblique";

const OBLIQUE_ENDPOINT = `https://wupp-oblique.cismet.de`;

export const NADIR_CAMERA_ID = "NAD";

const SENSOR_SPECS: Record<string, SensorSpecs> = Object.freeze({
  // iXM-RS150F Camera or older
  // parameters manually extracted from the camera calibration data in the prj file
  // https://www.phaseone.com/wp-content/uploads/2024/01/iXM-RS150F_Fact-Sheet_Display_EN_2023.pdf

  RS150: {
    name: "iXM-RS150F Camera",
    columns: 14204,
    rows: 10652,
    ppmm: 265.9574468085,
  },
});

const INTERIOR_ORIENTATIONS: Record<
  string,
  InteriorOrientationCalibrationData
> = Object.freeze({
  // parameters manually extracted from the camera calibration data in the prj file
  "170": {
    label: "front",
    model: SENSOR_SPECS.RS150,
    principalPointX: 7102.5638,
    principalPointY: 5313,
    columns: 14204,
    rows: 10652,
    focalLength: 108.644,
    ppmm: 265.9574468085,
    CCD_INTERIOR_ORIENTATION: [
      [0, -265.9574468085, 7102.5638],
      [-265.9574468085, 0, 5313],
    ],
  },
  "171": {
    label: "right",
    model: SENSOR_SPECS.RS150,
    principalPointX: 5347.5745,
    principalPointY: 7078.0957,
    columns: 10652,
    rows: 14204,
    focalLength: 108.723,
    ppmm: 265.9574468085,
    CCD_INTERIOR_ORIENTATION: [
      [-265.9574468085, 0, 5347.5745],
      [0, 265.9574468085, 7078.0957],
    ],
  },
  "174": {
    label: "back",
    model: SENSOR_SPECS.RS150,
    principalPointX: 7120.6489,
    principalPointY: 5336.9362,
    columns: 14204,
    rows: 10652,
    focalLength: 108.632,
    ppmm: 265.9574468085,
    CCD_INTERIOR_ORIENTATION: [
      [0, 265.9574468085, 7120.6489],
      [265.9574468085, 0, 5336.9362],
    ],
  },
  "176": {
    label: "left",
    model: SENSOR_SPECS.RS150,
    principalPointX: 5351.5638,
    principalPointY: 7099.9043,
    columns: 10652,
    rows: 14204,
    focalLength: 108.74,
    ppmm: 265.9574468085,
    CCD_INTERIOR_ORIENTATION: [
      [265.9574468085, 0, 5351.5638],
      [0, -265.9574468085, 7099.9043],
    ],
  },
});

export const CAMERA_ID_TO_UP_VECTOR_MATRIX_MAPPING = Object.freeze({
  "170": { rowIndex: 2, negate: true }, // forward
  "171": { rowIndex: 1, negate: false }, // right
  "174": { rowIndex: 2, negate: true }, // rear
  "176": { rowIndex: 1, negate: true }, // left
});

export const OBLIQUE_2024: ObliqueConfig = {
  uri: `${OBLIQUE_ENDPOINT}/2024`,
  exteriorOrientations: {
    crs: "EPSG:25832",
    uri: `${OBLIQUE_ENDPOINT}/2024/metadata/exterior_orientations.json`,
  },
  interiorOrientations: INTERIOR_ORIENTATIONS,
  upMatrixMapping: CAMERA_ID_TO_UP_VECTOR_MATRIX_MAPPING,
};

// only used for debugging
export const OBLIQUE_2024_FPRFC_GEOJSON_URI = `${OBLIQUE_ENDPOINT}/2024/metadata/fprfc.geojson`;
