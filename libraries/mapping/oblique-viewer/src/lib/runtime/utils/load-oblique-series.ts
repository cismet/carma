import { getProj4Converter } from "@carma-geo/proj";
import {
  COMPACT_CATALOG_FORMAT,
  decodeCompactCatalog,
} from "../../core/utils/compact-catalog";
import { prepareCompactCatalog } from "./prepare-compact-catalog";
import type {
  ObliqueDataset,
  ObliqueSelectionData,
  PointWithSector,
} from "../../core/types";
import {
  buildImageRecords,
  summarizeObliquePitchStatistics,
  wgs84ToDatasetXY,
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
    if (dataset.metadataFormat === COMPACT_CATALOG_FORMAT) {
      const bytes = new Uint8Array(await response.arrayBuffer());
      requestSignal.throwIfAborted();
      const inflated =
        bytes[0] === 0x1f && bytes[1] === 0x8b
          ? new Uint8Array(
              await new Response(
                new Blob([bytes])
                  .stream()
                  .pipeThrough(new DecompressionStream("gzip"))
              ).arrayBuffer()
            )
          : bytes;
      const decoded = decodeCompactCatalog(inflated);
      if (decoded.seriesId !== dataset.id)
        throw new Error("Compact catalogue series mismatch.");
      const prepared = await prepareCompactCatalog(decoded, requestSignal);
      // A shared, catalogue-derived DHHN plane bootstraps queries before a photo
      // is selected. It is an approximation plane, never a synthetic DEM hit.
      const heights =
        dataset.referenceGroundHeightMeters === undefined
          ? [...prepared.centers.values()]
              .map((center) => center.heightMeters)
              .filter(Number.isFinite)
              .sort((a, b) => a - b)
          : [];
      const middle = Math.floor(heights.length / 2);
      const median = heights.length
        ? (heights[middle] + heights[Math.floor((heights.length - 1) / 2)]) / 2
        : undefined;
      const records = buildImageRecords(
        prepared.metadata,
        {
          ...dataset,
          heightDatum: "dhhn2016",
          referenceGroundHeightMeters:
            dataset.referenceGroundHeightMeters ?? median,
        },
        converter
      );
      for (const record of records.imageRecords.values())
        record.catalogCenter = prepared.centers.get(record.sourceId);
      requestSignal.throwIfAborted();
      return records;
    }
    const document: unknown = compressed
      ? await readCompressedCatalog(response, requestSignal)
      : await response.json();
    requestSignal.throwIfAborted();
    const records = buildImageRecords(document, dataset, converter);
    requestSignal.throwIfAborted();
    return records;
  };
  const loadCatalog = async () => {
    if (dataset.inlineCatalog) {
      const built = buildImageRecords(
        dataset.inlineCatalog.metadata,
        dataset,
        converter
      );
      for (const record of built.imageRecords.values()) {
        const supplied = dataset.inlineCatalog.recordGeometry;
        if (supplied?.catalogCenter)
          record.catalogCenter = supplied.catalogCenter;
        if (supplied?.footprint) {
          record.footprint = supplied.footprint;
          record.footprintApproximate = supplied.footprintApproximate ?? false;
        }
        record.assets = {
          pyramid: {
            href: dataset.inlineCatalog.avifUrl,
            type: "image/avif",
            roles: ["data"],
          },
        };
      }
      return built;
    }
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
    if (dataset.inlineCatalog || !dataset.footprintsURI) return none;
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
    if (record.catalogCenter) {
      const center = record.catalogCenter;
      const xy = wgs84ToDatasetXY(converter, center.longitude, center.latitude);
      centers.set(record.id, {
        id: record.id,
        x: xy[0],
        y: xy[1],
        longitude: center.longitude,
        latitude: center.latitude,
        cardinal: record.sector,
      });
    } else if (rawCenter)
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
    } else if (!record.footprint) record.footprintApproximate = true;
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
