import { useEffect, useMemo, useState } from "react";
import { getProj4Converter } from "@carma-geo/proj";
import type {
  ObliqueDataset,
  ObliqueSelectionData,
  PointWithSector,
} from "../../core/types";
import { buildImageRecords } from "../../core/utils/imageRecord";
import {
  estimateGroundCenter,
  estimateGroundFootprint,
} from "../../core/utils/selection";
import {
  fetchGeoJson,
  getFootprintCenterpoints,
  type FootprintCollection,
} from "../utils/footprints";

export type ObliqueData = ObliqueSelectionData & {
  footprintData: FootprintCollection;
};

export type ObliqueSeriesDataState = {
  id: string;
  isLoading: boolean;
  error: string | null;
  imageCount: number;
};

export type ObliqueDataState = {
  data: ObliqueData | null;
  isLoading: boolean;
  /** At least one loaded series is usable; a second failed series does not block it. */
  isAllDataReady: boolean;
  error: string | null;
  perSeries: ObliqueSeriesDataState[];
};

const IDLE: ObliqueDataState = {
  data: null,
  isLoading: false,
  isAllDataReady: false,
  error: null,
  perSeries: [],
};
const cache = new Map<string, Promise<ObliqueData>>();
const emptyFootprints = (): FootprintCollection => ({
  type: "FeatureCollection",
  features: [],
});

/** Configuration/calibration changes cannot reuse a differently interpreted cached series. */
const cacheKey = (dataset: ObliqueDataset): string => JSON.stringify(dataset);

const loadSeries = (dataset: ObliqueDataset): Promise<ObliqueData> => {
  const key = cacheKey(dataset);
  const cached = cache.get(key);
  if (cached) return cached;
  const loading = (async () => {
    const response = await fetch(dataset.exteriorOrientationsURI);
    if (!response.ok) throw new Error(`Metadaten: HTTP ${response.status}`);
    const converter = getProj4Converter(dataset.crs, "EPSG:4326");
    const built = buildImageRecords(await response.json(), dataset, converter);
    // Delivered footprints are optional. Unavailable ones do not hide valid image metadata.
    let delivered = emptyFootprints();
    if (dataset.footprintsURI) {
      try {
        delivered = await fetchGeoJson(dataset.footprintsURI);
      } catch {
        /* Calibrated ground-plane approximations remain visibly marked below. */
      }
    }
    const deliveredCenters = new Map(
      getFootprintCenterpoints(delivered, converter).map((point) => [
        point.id,
        point,
      ])
    );
    const deliveredById = new Map(
      delivered.features.map((feature) => [
        feature.properties.FILENAME,
        feature,
      ])
    );
    const centers = new Map<string, PointWithSector>();
    const footprintData = emptyFootprints();
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
        footprintData.features.push({
          ...original,
          properties: {
            ...original.properties,
            FILENAME: record.id,
            SOURCE_ID: record.sourceId,
            SERIES_ID: record.seriesId,
          },
        });
      } else {
        record.footprint = estimateGroundFootprint(
          record,
          built.dataset,
          converter
        );
        record.footprintApproximate = true;
        if (record.footprint)
          footprintData.features.push({
            type: "Feature",
            geometry: { type: "Polygon", coordinates: [record.footprint] },
            properties: {
              FILENAME: record.id,
              SOURCE_ID: record.sourceId,
              SERIES_ID: record.seriesId,
              APPROXIMATE: true,
            },
          });
      }
    }
    return {
      imageRecords: built.imageRecords,
      datasets: new Map([[dataset.id, built.dataset]]),
      centers,
      footprintData,
    };
  })();
  cache.set(key, loading);
  loading.catch(() => {
    cache.delete(key);
  });
  return loading;
};

const mergeSeries = (loaded: Iterable<ObliqueData>): ObliqueData => {
  const result: ObliqueData = {
    imageRecords: new Map(),
    datasets: new Map(),
    centers: new Map(),
    footprintData: emptyFootprints(),
  };
  for (const data of loaded) {
    for (const [id, record] of data.imageRecords)
      result.imageRecords.set(id, record);
    for (const [id, dataset] of data.datasets) result.datasets.set(id, dataset);
    for (const [id, center] of data.centers) result.centers.set(id, center);
    result.footprintData.features.push(...data.footprintData.features);
  }
  return result;
};

export const useObliqueData = (
  enabledDatasets: readonly ObliqueDataset[],
  enabled: boolean
): ObliqueDataState => {
  const [state, setState] = useState<ObliqueDataState>(IDLE);
  useEffect(() => {
    if (!enabled || enabledDatasets.length === 0) {
      setState(IDLE);
      return undefined;
    }
    let cancelled = false;
    const statuses = new Map(
      enabledDatasets.map((dataset) => [
        dataset.id,
        {
          id: dataset.id,
          isLoading: true,
          error: null,
          imageCount: 0,
        } as ObliqueSeriesDataState,
      ])
    );
    const loaded = new Map<string, ObliqueData>();
    const publish = () => {
      if (cancelled) return;
      const perSeries = [...statuses.values()];
      const data = loaded.size > 0 ? mergeSeries(loaded.values()) : null;
      setState({
        data,
        perSeries,
        isLoading: perSeries.some((status) => status.isLoading),
        isAllDataReady: (data?.imageRecords.size ?? 0) > 0,
        error:
          perSeries
            .filter((status) => status.error)
            .map(
              (status) =>
                `${
                  enabledDatasets.find((dataset) => dataset.id === status.id)
                    ?.label ?? status.id
                }: ${status.error}`
            )
            .join("; ") || null,
      });
    };
    publish();
    for (const dataset of enabledDatasets) {
      loadSeries(dataset)
        .then((data) => {
          loaded.set(dataset.id, data);
          statuses.set(dataset.id, {
            id: dataset.id,
            isLoading: false,
            error:
              data.imageRecords.size > 0
                ? null
                : "Keine Bilder in den Metadaten.",
            imageCount: data.imageRecords.size,
          });
          publish();
        })
        .catch((error: unknown) => {
          statuses.set(dataset.id, {
            id: dataset.id,
            isLoading: false,
            error:
              error instanceof Error
                ? error.message
                : "Metadaten konnten nicht geladen werden.",
            imageCount: 0,
          });
          publish();
        });
    }
    return () => {
      cancelled = true;
    };
  }, [enabledDatasets, enabled]);
  // Checkbox changes take effect in this render, before the fetch effect can publish.
  const filtered = useMemo(() => {
    const enabledIds = new Set(enabledDatasets.map((dataset) => dataset.id));
    return state.data
      ? {
          imageRecords: new Map(
            [...state.data.imageRecords].filter(([, record]) =>
              enabledIds.has(record.seriesId)
            )
          ),
          datasets: new Map(
            [...state.data.datasets].filter(([id]) => enabledIds.has(id))
          ),
          centers: new Map(
            [...state.data.centers].filter(
              ([id]) =>
                state.data?.imageRecords.get(id) &&
                enabledIds.has(state.data.imageRecords.get(id)!.seriesId)
            )
          ),
          footprintData: {
            ...state.data.footprintData,
            features: state.data.footprintData.features.filter((feature) =>
              enabledIds.has(String(feature.properties.SERIES_ID))
            ),
          },
        }
      : null;
  }, [enabledDatasets, state.data]);
  const visibleStatuses = state.perSeries.filter((status) =>
    enabledDatasets.some((dataset) => dataset.id === status.id)
  );
  return {
    ...state,
    data: enabled ? filtered : null,
    isLoading: enabled && visibleStatuses.some((status) => status.isLoading),
    isAllDataReady: enabled && (filtered?.imageRecords.size ?? 0) > 0,
    perSeries: visibleStatuses,
    error:
      visibleStatuses
        .filter((status) => status.error)
        .map(
          (status) =>
            `${
              enabledDatasets.find((dataset) => dataset.id === status.id)
                ?.label ?? status.id
            }: ${status.error}`
        )
        .join("; ") || null,
  };
};
