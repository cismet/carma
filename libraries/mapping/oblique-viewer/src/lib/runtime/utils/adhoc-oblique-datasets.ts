import { Vector3 } from "three";
import { ecefToCartographic, getProj4Converter } from "@carma-geo/proj";
import { radToDegNumeric } from "@carma-units";
import type { Longitude, Latitude } from "@carma-geo/data-structures";
import type { Matrix3RowMajor } from "@carma-commons/math";
import { ecefCameraGridRotation } from "../../core/utils/ecef-camera-grid-rotation";
import { useSyncExternalStore } from "react";
import {
  openStandaloneAvif,
  type StandaloneAvifDocument,
} from "@carma-commons/image-pyramid";
import {
  validateMetadata,
  qualifiedImageId,
} from "../../core/utils/imageRecord";
import type {
  ObliqueDataset,
  ObliqueMetadata,
  ObliqueImageRecord,
} from "../../core/types";

export type AdHocObliqueDataset = {
  id: string;
  sourceId: string;
  dataset: ObliqueDataset;
  release: () => void;
};
let entries: readonly AdHocObliqueDataset[] = [];
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
const snapshot = () => entries;
export const useAdHocObliqueDatasets = () =>
  useSyncExternalStore(subscribe, snapshot, snapshot);
const triplet = (x: unknown): x is [number, number, number] =>
  Array.isArray(x) && x.length === 3 && x.every(Number.isFinite);

export function datasetFromStandaloneAvif(
  doc: StandaloneAvifDocument,
  url: string,
  id: string
): ObliqueDataset {
  const { catalogSnapshot: c, pixelMapping: pixels } = doc;
  const metadata = structuredClone(c.metadata) as unknown as ObliqueMetadata;
  const source = c.dataset as unknown as ObliqueDataset;
  const image = metadata.images?.[c.sourceId],
    camera = image && metadata.cameras?.[image.cameraId],
    pose = c.operationalPose;
  if (
    !image ||
    Object.keys(metadata.images).length !== 1 ||
    !camera ||
    !triplet(pose?.cameraEcefMeters) ||
    pose.crs !== "EPSG:4978" ||
    !Array.isArray(pose.worldToCameraRows) ||
    pose.worldToCameraRows.length !== 3 ||
    !pose.worldToCameraRows.every(triplet)
  )
    throw Error(
      "Die AVIF enthält keine vollständige Einzelbild-Kalibrierung und ECEF-Pose."
    );
  if (
    metadata.conventions?.verticalDatum !== "dhhn2016" ||
    !triplet(image.cameraEcefMeters) ||
    image.cameraEcefMeters.some(
      (n, i) => Math.abs(n - pose.cameraEcefMeters[i]) > 0.001
    )
  )
    throw Error(
      "Die eingebettete Kamera benötigt eine konsistente, vorbereitete DHHN-/ECEF-Pose."
    );
  if (
    pixels.calibrationDimensions[0] !== camera.widthPx ||
    pixels.calibrationDimensions[1] !== camera.heightPx ||
    pixels.primaryDimensions[0] * 2 !== camera.widthPx ||
    pixels.primaryDimensions[1] * 2 !== camera.heightPx
  )
    throw Error(
      "Die AVIF-Bildmaße passen nicht zur eingebetteten Sensorkalibrierung."
    );
  // Current reader handles full-sensor, unmirrored L1 images. Never silently fly
  // with a crop or pixel convention that its geometry cannot interpret.
  for (let level = 1; level <= 4; level++) {
    const s = 2 ** level,
      a = pixels.levelToSensorAffine[String(level)],
      h = (s - 1) / 2;
    if (
      JSON.stringify(a) !==
      JSON.stringify([
        [s, 0, h],
        [0, s, h],
      ])
    )
      throw Error("Nicht unterstützte AVIF-Sensorabbildung.");
  }
  if (
    source.crs !== "EPSG:25832" ||
    !source.cameraIdToDirection ||
    !source.cameras ||
    !Number.isFinite(source.pitchDeg)
  )
    throw Error("Unvollständige eingebettete Bildserien-Konvention.");
  if (!triplet(image.positionM))
    throw Error("Ungültige eingebettete Kamerahöhe.");
  const eye = new Vector3(...pose.cameraEcefMeters),
    cartographic = ecefToCartographic(eye);
  const longitude = radToDegNumeric(cartographic.longitude),
    latitude = radToDegNumeric(cartographic.latitude);
  const xy = getProj4Converter("EPSG:4326", "EPSG:25832").forward([
    longitude as Longitude.deg,
    latitude as Latitude.deg,
  ]);
  image.positionM = [xy[0], xy[1], image.positionM[2]];
  image.rotationMatrixRows = ecefCameraGridRotation(
    pose.worldToCameraRows as Matrix3RowMajor,
    eye,
    longitude,
    latitude
  );
  metadata.seriesId = id;
  delete image.assets; // File identity is assigned by the reader, not untrusted hrefs.
  const dataset: ObliqueDataset = {
    ...source,
    id,
    label: c.sourceId,
    shortLabel: "AVIF",
    enabledByDefault: true,
    metadataFormat: "inpho-v1",
    heightDatum: "dhhn2016",
    allowUnverifiedSourceHeight: false,
    exteriorOrientationsURI: "embedded:avif",
    compressedCatalogURI: undefined,
    directionalCatalogs: undefined,
    directionalCatalogPriority: undefined,
    footprintsURI: undefined,
    previewPath: "embedded:avif",
    downloadPath: undefined,
    originalImageUrlTemplate: undefined,
    avifPyramidTemplate: undefined,
    availableCameraViews: camera.view ? [camera.view] : [],
    avifOnly: true,
    minimumPreviewQualityLevel: "1",
    previewQualityLevel: "4",
    hqQualityLevel: "1",
    downloadQualityLevel: "1",
    catalogVersion: id,
    inlineCatalog: {
      metadata,
      avifUrl: url,
      recordGeometry: c.recordGeometry as
        | Partial<ObliqueImageRecord>
        | undefined,
    },
  };
  validateMetadata(metadata, dataset);
  const g = dataset.inlineCatalog!.recordGeometry;
  if (
    g?.catalogCenter &&
    (!triplet(g.catalogCenter.ecefMeters) ||
      ![
        g.catalogCenter.longitude,
        g.catalogCenter.latitude,
        g.catalogCenter.heightMeters,
      ].every(Number.isFinite))
  )
    throw Error("Ungültiger eingebetteter Bodenpunkt.");
  if (
    g?.footprint &&
    !g.footprint.every((p) => p.length === 2 && p.every(Number.isFinite))
  )
    throw Error("Ungültiger eingebetteter Bild-Footprint.");
  return dataset;
}

/** Register an in-memory viewer dataset; no catalog URL or upload is involved. */
export async function registerAdHocObliqueAvif(
  input: Blob | string,
  signal: AbortSignal,
  options?: { id?: string }
): Promise<AdHocObliqueDataset> {
  const existing = options?.id
    ? entries.find((entry) => entry.id === options.id)
    : undefined;
  if (existing) return existing;
  const opened = await openStandaloneAvif(input, signal);
  try {
    const doc = opened.document!,
      id = options?.id ?? `adhoc-avif-${crypto.randomUUID()}`;
    if (
      JSON.stringify(doc.pixelMapping.primaryDimensions) !==
      JSON.stringify([
        opened.layout.index.dimensions.width,
        opened.layout.index.dimensions.height,
      ])
    )
      throw Error("AVIF-Pixelmapping und Containermaße widersprechen sich.");
    const dataset = datasetFromStandaloneAvif(doc, opened.url, id);
    let released = false;
    const entry: AdHocObliqueDataset = {
      id,
      sourceId: doc.catalogSnapshot.sourceId,
      dataset,
      release: () => {
        if (released) return;
        released = true;
        entries = entries.filter((x) => x !== entry);
        opened.release();
        notify();
      },
    };
    entries = [...entries, entry];
    notify();
    return entry;
  } catch (error) {
    opened.release();
    throw error;
  }
}
export const clearAdHocObliqueDatasets = () => {
  for (const entry of [...entries]) entry.release();
};
export const adHocQualifiedImageId = (entry: AdHocObliqueDataset) =>
  qualifiedImageId(entry.id, entry.sourceId);
