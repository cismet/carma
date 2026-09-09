import { useEffect, useState } from "react";

import type {
  ExteriorOrientations,
  ObliqueDataset,
  ObliqueImageRecord,
  ObliqueImageRecordMap,
} from "../types";
import {
  fetchGeoJson,
  getFootprintCenterpoints,
  type FootprintCollection,
} from "../utils/footprints";
import {
  extendObliqueImageRecord,
  mapExtOriArrToRecord,
  type DatasetConverter,
} from "../utils/imageRecord";
import { degToRad } from "../utils/orientation";
import {
  createRBushByCardinal,
  type RBushBySectorBlocks,
} from "../utils/spatialIndexing";

/**
 * The dataset in memory: every image's record, the footprints, and one
 * spatial index of footprint centres per sector.
 *
 * Fetched once per url and kept for the page's lifetime, so switching the
 * viewer off and on again costs nothing: the exterior orientations of a
 * whole flight are several megabytes, and the records built from them are
 * what every search reads.
 */

export type ObliqueData = {
  imageRecords: ObliqueImageRecordMap;
  footprintData: FootprintCollection;
  centerTrees: RBushBySectorBlocks;
};

export type ObliqueDataState = {
  data: ObliqueData | null;
  isLoading: boolean;
  isAllDataReady: boolean;
  error: string | null;
};

const IDLE: ObliqueDataState = {
  data: null,
  isLoading: false,
  isAllDataReady: false,
  error: null,
};

const cache = new Map<string, Promise<ObliqueData>>();

const cacheKey = (dataset: ObliqueDataset): string =>
  `${dataset.exteriorOrientationsURI}|${dataset.footprintsURI}|${dataset.headingOffsetDeg}`;

const fetchExteriorOrientations = async (
  url: string
): Promise<ExteriorOrientations> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `exterior orientations: ${response.status} ${response.statusText}`
    );
  }
  return (await response.json()) as ExteriorOrientations;
};

const buildRecords = (
  orientations: ExteriorOrientations,
  dataset: ObliqueDataset,
  converter: DatasetConverter
): ObliqueImageRecordMap => {
  const started = performance.now();
  const headingOffsetRad = degToRad(dataset.headingOffsetDeg);
  const records = new Map<string, ObliqueImageRecord>();
  for (const [id, arr] of Object.entries(orientations)) {
    const basic = mapExtOriArrToRecord(id, arr);
    if (!basic) continue;
    records.set(
      id,
      extendObliqueImageRecord(
        basic,
        converter,
        headingOffsetRad,
        dataset.cameraIdToDirection
      )
    );
  }
  console.info(
    `[OBLIQUE] ${records.size} image records in ${Math.round(
      performance.now() - started
    )} ms`
  );
  return records;
};

const loadData = (
  dataset: ObliqueDataset,
  converter: DatasetConverter
): Promise<ObliqueData> => {
  const key = cacheKey(dataset);
  const cached = cache.get(key);
  if (cached) return cached;
  const loading = Promise.all([
    fetchExteriorOrientations(dataset.exteriorOrientationsURI),
    fetchGeoJson(dataset.footprintsURI),
  ]).then(([orientations, footprintData]) => {
    const imageRecords = buildRecords(orientations, dataset, converter);
    const centerTrees = createRBushByCardinal(
      getFootprintCenterpoints(footprintData, converter)
    );
    return { imageRecords, footprintData, centerTrees };
  });
  cache.set(key, loading);
  loading.catch(() => {
    // a failed fetch is not kept, so switching on again retries
    cache.delete(key);
  });
  return loading;
};

export const useObliqueData = (
  dataset: ObliqueDataset,
  converter: DatasetConverter,
  enabled: boolean
): ObliqueDataState => {
  const [state, setState] = useState<ObliqueDataState>(IDLE);

  useEffect(() => {
    if (!enabled) {
      setState(IDLE);
      return undefined;
    }
    let cancelled = false;
    setState({ data: null, isLoading: true, isAllDataReady: false, error: null });
    loadData(dataset, converter)
      .then((data) => {
        if (cancelled) return;
        setState({
          data,
          isLoading: false,
          isAllDataReady: data.imageRecords.size > 0,
          error:
            data.imageRecords.size > 0
              ? null
              : "Keine Schrägluftbilder in den Metadaten gefunden.",
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error("[OBLIQUE] loading the dataset failed", error);
        setState({
          data: null,
          isLoading: false,
          isAllDataReady: false,
          error: "Schrägluftbild-Daten konnten nicht geladen werden.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [dataset, converter, enabled]);

  return state;
};
