import type { Matrix3RowMajor } from "@carma-commons/math";
import type { StandaloneAvifDocument } from "@carma-commons/image-pyramid";
import type {
  ObliqueDataset,
  ObliqueMetadata,
  ObliqueImageRecord,
} from "../types";

/** Producer-side dependency closure of one fully prepared catalogue photograph. */
export function createStandaloneObliqueDocument(input: {
  dataset: ObliqueDataset;
  metadata: ObliqueMetadata;
  sourceId: string;
  ecefWorldToCameraRows: Matrix3RowMajor;
  recordGeometry?: Pick<
    ObliqueImageRecord,
    "catalogCenter" | "footprint" | "footprintApproximate"
  >;
  qualityTargets?: [number, number, number, number];
}): StandaloneAvifDocument {
  const { dataset, metadata, sourceId, ecefWorldToCameraRows } = input;
  const image = metadata.images[sourceId],
    camera = image && metadata.cameras[image.cameraId];
  if (!image?.cameraEcefMeters || !camera)
    throw Error("Prepared image/calibration/ECEF catalogue data required");
  const cameras = { [image.cameraId]: camera },
    record = { ...image, assets: undefined };
  const series = {
    ...dataset,
    cameras: { [image.cameraId]: dataset.cameras[image.cameraId] },
    exteriorOrientationsURI: "embedded:avif",
    compressedCatalogURI: undefined,
    directionalCatalogs: undefined,
    directionalCatalogPriority: undefined,
    footprintsURI: undefined,
    previewPath: "embedded:avif",
    downloadPath: undefined,
    originalImageUrlTemplate: undefined,
    avifPyramidTemplate: undefined,
    inlineCatalog: undefined,
    animations: {},
  };
  const levelToSensorAffine: Record<string, number[][]> = {};
  for (let level = 1; level <= 4; level++) {
    const s = 2 ** level;
    levelToSensorAffine[level] = [
      [s, 0, (s - 1) / 2],
      [0, s, (s - 1) / 2],
    ];
  }
  return {
    convention: "cismet.oblique-avif",
    version: 1,
    delivery: {
      levels: [4, 3, 2, 1],
      previewLevel: 4,
      qualityTargets: input.qualityTargets ?? [60, 80, 85, 90],
    },
    catalogSnapshot: {
      sourceId,
      dataset: JSON.parse(JSON.stringify(series)),
      metadata: { ...metadata, cameras, images: { [sourceId]: record } },
      recordGeometry: input.recordGeometry,
      operationalPose: {
        cameraEcefMeters: [...image.cameraEcefMeters],
        worldToCameraRows: ecefWorldToCameraRows.map((r) => [...r]),
        crs: "EPSG:4978",
        sourceVerticalDatum: dataset.heightDatum,
      },
    },
    pixelMapping: {
      calibrationDimensions: [camera.widthPx, camera.heightPx],
      primaryDimensions: [camera.widthPx / 2, camera.heightPx / 2],
      levelToSensorAffine,
    },
    provenance: {
      sourceLevel: 1,
      resamplingBackend: "cpu",
      labelPolicy: "none",
      state: "encoded-unverified",
      calibrationModel: "catalog-image-mm-affine",
      metadataSource: "decoded-catalogue-snapshot",
    },
  };
}
