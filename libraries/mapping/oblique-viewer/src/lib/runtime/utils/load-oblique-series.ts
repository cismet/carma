import { getProj4Converter } from "@carma-geo/proj";
import type {
  ObliqueDataset,
  ObliqueSelectionData,
  PointWithSector,
} from "../../core/types";
import {
  buildImageRecords,
  summarizeObliquePitchStatistics,
} from "../../core/utils/imageRecord";
import { estimateGroundCenter } from "../../core/utils/selection";
import {
  fetchGeoJson,
  getFootprintCenterpoints,
  type FootprintCollection,
} from "./footprints";

/** Gzip transport only: HTTP may already have decompressed the response body. */
const readCompressedCatalog = async (
  response: Response,
  signal?: AbortSignal
): Promise<unknown> => {
  const bytes = new Uint8Array(await response.arrayBuffer());
  signal?.throwIfAborted();
  const body =
    bytes[0] === 0x1f && bytes[1] === 0x8b
      ? new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))
      : new Blob([bytes]).stream();
  const document: unknown = await new Response(body).json();
  signal?.throwIfAborted();
  return document;
};

/** Footprints belong to image records; do not clone a second full GeoJSON catalog. */
export type ObliqueData = ObliqueSelectionData;
export const loadObliqueSeriesData = async (
  dataset: ObliqueDataset,
  signal?: AbortSignal,
  fetchSource: typeof fetch = fetch
): Promise<ObliqueData> => {
  signal?.throwIfAborted();
  const converter = getProj4Converter(dataset.crs, "EPSG:4326");
  // Catalog and footprints download together; one controller cancels both.
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", abort, { once: true });
  const requestSignal = controller.signal;
  const load = async (url: string, compressed: boolean) => {
    const response = await fetchSource(url, { signal: requestSignal });
    if (!response.ok) throw new Error(`Metadaten: HTTP ${response.status}`);
    const document: unknown = compressed
      ? await readCompressedCatalog(response, requestSignal)
      : await response.json();
    requestSignal.throwIfAborted();
    const records = buildImageRecords(document, dataset, converter);
    requestSignal.throwIfAborted();
    return records;
  };
  const loadCatalog = async () => {
    if (
      !dataset.compressedCatalogURI ||
      typeof DecompressionStream !== "function"
    )
      return load(dataset.exteriorOrientationsURI, false);
    try {
      return await load(dataset.compressedCatalogURI, true);
    } catch (error) {
      requestSignal.throwIfAborted();
      if (
        error &&
        typeof error === "object" &&
        "name" in error &&
        error.name === "AbortError"
      )
        throw error;
      return load(dataset.exteriorOrientationsURI, false);
    }
  };
  // Delivered footprints are optional. Unavailable ones do not hide valid image metadata.
  const loadFootprints = async (): Promise<FootprintCollection> => {
    const none: FootprintCollection = {
      type: "FeatureCollection",
      features: [],
    };
    if (!dataset.footprintsURI) return none;
    try {
      return await fetchGeoJson(
        dataset.footprintsURI,
        requestSignal,
        fetchSource
      );
    } catch (error) {
      if (signal?.aborted) throw error;
      /* Calibrated ground-plane approximations remain visibly marked below. */
      return none;
    }
  };
  let built: ReturnType<typeof buildImageRecords>;
  let delivered: FootprintCollection;
  try {
    [built, delivered] = await Promise.all([loadCatalog(), loadFootprints()]);
  } catch (error) {
    // A failed catalog makes the footprints useless; stop their download too.
    controller.abort();
    throw error;
  } finally {
    signal?.removeEventListener("abort", abort);
  }
  const deliveredCenters = new Map(
    getFootprintCenterpoints(delivered, converter).map((point) => [
      point.id,
      point,
    ])
  );
  const deliveredById = new Map(
    delivered.features.map((feature) => [feature.properties.FILENAME, feature])
  );
  const centers = new Map<string, PointWithSector>();
  for (const record of built.imageRecords.values()) {
    const original = deliveredById.get(record.sourceId);
    const rawCenter = deliveredCenters.get(record.sourceId);
    if (rawCenter)
      centers.set(record.id, {
        ...rawCenter,
        id: record.id,
        cardinal: record.sector,
      });
    else
      centers.set(
        record.id,
        estimateGroundCenter(record, built.dataset, converter)
      );
    if (original) {
      record.footprint = original.geometry.coordinates[0].map((position) => [
        position[0],
        position[1],
      ]);
      record.footprintApproximate = false;
    } else record.footprintApproximate = true;
  }
  return {
    ...summarizeObliquePitchStatistics({
      imageRecords: built.imageRecords,
      datasets: new Map([[dataset.id, built.dataset]]),
    }),
    imageRecords: built.imageRecords,
    datasets: new Map([[dataset.id, built.dataset]]),
    centers,
  };
};
