import { Matrix3, Matrix4, Vector3 } from "three";
import {
  createRasterEcefProjector,
  ecefToEnuMatrix,
  getProj4Converter,
} from "@carma-geo/proj";
import { degToRadNumeric, type Meters } from "@carma-units";
import type { Longitude, Latitude } from "@carma-geo/data-structures";
import type { Matrix3RowMajor } from "@carma-commons/math";
import type { ObliqueDataset, ObliqueMetadata } from "../types";
import { TEST_LEGACY_SERIES } from "./synthetic-series.test-fixture";
import { ecefCameraGridRotation } from "./ecef-camera-grid-rotation";

export const standalonePreparedFixture = () => {
  const longitude = 7.2 as Longitude.deg,
    latitude = 51.25 as Latitude.deg;
  const eye = createRasterEcefProjector()(
    longitude,
    latitude,
    1042,
    new Vector3()
  );
  const matrix = new Matrix3()
    .setFromMatrix4(new Matrix4().makeRotationX(degToRadNumeric(45)))
    .multiply(new Matrix3().setFromMatrix4(ecefToEnuMatrix(eye)));
  const e = matrix.elements,
    rows: Matrix3RowMajor = [
      [e[0], e[3], e[6]],
      [e[1], e[4], e[7]],
      [e[2], e[5], e[8]],
    ];
  const xy = getProj4Converter("EPSG:4326", "EPSG:25832").forward([
    longitude,
    latitude,
  ]);
  const camera = {
    widthPx: 2048,
    heightPx: 1024,
    focalLengthMm: 50,
    imageMmToPixelAffine: [
      [100, 0, 930.5],
      [0, -100, 570.5],
    ] as [[number, number, number], [number, number, number]],
    mountRotationDeg: 17,
    sourceId: "physical-camera-170",
    view: "front",
  };
  const dataset: ObliqueDataset = {
    ...structuredClone(TEST_LEGACY_SERIES),
    id: "prepared-source-series",
    metadataFormat: "inpho-v1",
    heightDatum: "dhhn2016",
    cameras: {
      ...structuredClone(TEST_LEGACY_SERIES.cameras),
      "170": {
        ...TEST_LEGACY_SERIES.cameras["170"],
        ...camera,
        principalPointPx: [930.5, 570.5],
        halfFovTan: 0.2048,
      },
    },
    compressedCatalogURI: "https://images.example.test/catalog.json.gz",
    footprintsURI: "https://images.example.test/footprints.geojson",
    avifPyramidTemplate: "https://images.example.test/{imageId}.avif",
    originalImageUrlTemplate: "https://images.example.test/{imageId}.tif",
  };
  const record = {
    cameraId: "170",
    cameraEcefMeters: eye.toArray() as [number, number, number],
    positionM: [xy[0], xy[1], 1000] as [number, number, number],
    rotationMatrixRows: ecefCameraGridRotation(rows, eye, longitude, latitude),
    stationId: "source-station",
    lineIndex: 8,
    waypointIndex: 4,
    sensorGroundRangeMeters: 800 as Meters,
    assets: {
      original: { href: "https://untrusted.example.test/original.tif" },
    },
  };
  const metadata: ObliqueMetadata = {
    schemaVersion: 1,
    seriesId: dataset.id,
    conventions: structuredClone(dataset.sourceConventions),
    cameras: { "170": camera, other: { ...camera, sourceId: "unused-camera" } },
    images: { photo: record, unusedPhoto: { ...record, cameraId: "other" } },
  };
  const centerEye = createRasterEcefProjector()(
    7.202,
    51.254,
    162,
    new Vector3()
  );
  const recordGeometry = {
    catalogCenter: {
      longitude: 7.202,
      latitude: 51.254,
      heightMeters: 120 as Meters,
      ecefMeters: centerEye.toArray() as [number, number, number],
    },
    footprint: [
      [7.19, 51.24],
      [7.21, 51.24],
      [7.21, 51.26],
      [7.19, 51.26],
    ] as [number, number][],
    footprintApproximate: false,
  };
  return {
    dataset,
    metadata,
    sourceId: "photo",
    ecefWorldToCameraRows: rows,
    recordGeometry,
    eye,
    longitude,
    latitude,
  };
};
