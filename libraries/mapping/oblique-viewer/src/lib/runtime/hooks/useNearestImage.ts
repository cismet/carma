import { useCallback, useEffect, useRef, useState } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";

import { getGcg2016Wgs84VerticalTransformer } from "@carma-geo/proj";
import type { Altitude, LngLatArray } from "@carma-geo/data-structures";
import { degToRadNumeric } from "@carma-units";
import type {
  CardinalDirection,
  NearestObliqueImageRecord,
  ObliqueDataset,
  ObliqueGroundTarget,
  ObliqueViewMode,
  ObliqueViewQuery,
} from "../../core/types";
import { getHeadingFromCardinalDirection } from "../../core/utils/orientation";
import {
  createImageSelectionSearch,
  type ImageSelectionSearch,
} from "../utils/image-selection";
import {
  MAX_IMAGE_SELECTION_BATCH_SIZE,
  type ImageSelectionBatchResult,
} from "../utils/image-selection-messages";
import type { ObliqueData } from "./useObliqueData";

/** Continuous camera/target geometry ranks candidates from every loaded enabled series. */
export type RefreshSearchArgs = {
  /** search this sector rather than the camera's */
  direction?: CardinalDirection;
  /** search for this heading rather than the camera's, radians */
  headingRad?: number;
  pitchRad?: number;
  cameraView?: "nadir" | "oblique";
  target?: ObliqueGroundTarget;
  /** skip the debounce */
  immediate?: boolean;
  /** return the ranking without touching the selection */
  computeOnly?: boolean;
  excludeImageId?: string;
  navigationOrigin?: ObliqueGroundTarget;
  navigationSelection?: ObliqueViewQuery["navigationSelection"];
  navigationArrow?: ObliqueViewQuery["navigationArrow"];
  numCandidates?: number;
};

type UseNearestImageOptions = {
  map: MaplibreMap | null;
  /** search on move */
  enabled: boolean;
  dataset: ObliqueDataset;
  viewMode?: ObliqueViewMode;
  data: ObliqueData | null;
  /** the selection is held (preview up, flight running); on-demand searches still compute */
  locked: boolean;
  selectedImageId: string | null;
  onSelect: (next: NearestObliqueImageRecord | null) => void;
  onCandidates?: (ranked: NearestObliqueImageRecord[]) => void;
  selectionStrategy?: ObliqueViewQuery["selectionStrategy"];
  debounceMs?: number;
};

export const useNearestImage = ({
  map,
  enabled,
  dataset,
  viewMode = "oblique",
  data,
  locked,
  selectedImageId,
  onSelect,
  onCandidates,
  selectionStrategy,
  debounceMs = 150,
}: UseNearestImageOptions) => {
  const modeRef = useRef(viewMode);
  modeRef.current = viewMode;
  const activeRef = useRef(true);
  const heightRefreshTimerRef = useRef<number | undefined>(undefined);
  const refreshRef = useRef<
    (
      args?: RefreshSearchArgs
    ) => Promise<NearestObliqueImageRecord[] | undefined>
  >(() => Promise.resolve(undefined));
  const [heightResolutionRevision, setHeightResolutionRevision] = useState(0);
  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
      window.clearTimeout(heightRefreshTimerRef.current);
    };
  }, []);
  const searchRef = useRef<{
    data: ObliqueData;
    search: ImageSelectionSearch;
  } | null>(null);
  const requestIdRef = useRef(0);
  const navigationGenerationRef = useRef(0);
  const dataRef = useRef(data);
  dataRef.current = data;
  useEffect(() => {
    requestIdRef.current++;
    navigationGenerationRef.current++;
    if (!data) {
      searchRef.current?.search.dispose();
      searchRef.current = null;
      return;
    }
    if (searchRef.current) {
      searchRef.current.data = data;
      searchRef.current.search.update?.(data);
    } else
      searchRef.current = {
        data,
        search: createImageSelectionSearch(data),
      };
  }, [data]);
  useEffect(
    () => () => {
      requestIdRef.current++;
      navigationGenerationRef.current++;
      searchRef.current?.search.dispose();
      searchRef.current = null;
    },
    []
  );
  useEffect(() => {
    requestIdRef.current++;
  }, [map, enabled, locked, viewMode, selectionStrategy]);
  const lastSearchTimeRef = useRef(0);
  const convertedHeightsRef = useRef(new Map<string, number>());
  const convertingHeightsRef = useRef(
    new Map<string, Promise<number | undefined>>()
  );
  const selectedIdRef = useRef(selectedImageId);
  selectedIdRef.current = selectedImageId;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onCandidatesRef = useRef(onCandidates);
  onCandidatesRef.current = onCandidates;
  const lockedRef = useRef(locked);
  lockedRef.current = locked;

  const headingOffsetRad = degToRadNumeric(dataset.headingOffsetDeg);
  const { numNearestImages, maxDistanceMeters } = dataset;

  const buildQuery = useCallback(
    async (
      args: RefreshSearchArgs,
      mode: ObliqueViewMode
    ): Promise<ObliqueViewQuery | undefined> => {
      if (!map || !data) return undefined;
      const heading =
        typeof args.headingRad === "number"
          ? args.headingRad
          : args.direction !== undefined
          ? getHeadingFromCardinalDirection(args.direction) + headingOffsetRad
          : degToRadNumeric(map.getBearing());
      const pitch = args.pitchRad ?? degToRadNumeric(map.getPitch());
      const center = map.getCenter();
      const target = args.target ?? {
        longitude: center.lng,
        latitude: center.lat,
        heightMeters: map.queryTerrainElevation(center) ?? undefined,
        heightDatum: "dhhn2016" as const,
      };
      const heightKey = `${target.longitude}|${target.latitude}|${target.heightMeters}|${target.heightDatum}`;
      const perSeriesTargetHeightMeters = new Map<string, number>();
      for (const [id, series] of data.datasets) {
        if (
          target.heightMeters === undefined ||
          !target.heightDatum ||
          target.heightDatum === "unknown" ||
          series.heightDatum === "unknown" ||
          series.heightDatum === target.heightDatum
        )
          continue;
        const key = `${heightKey}|${series.heightDatum}`;
        const converted = convertedHeightsRef.current.get(key);
        if (converted !== undefined) {
          perSeriesTargetHeightMeters.set(id, converted);
          continue;
        }
        let conversion = convertingHeightsRef.current.get(key);
        if (!conversion) {
          const coordinate = [
            target.longitude,
            target.latitude,
          ] as LngLatArray.deg;
          const transform = getGcg2016Wgs84VerticalTransformer();
          const height =
            target.heightDatum === "dhhn2016"
              ? transform.forward(
                  coordinate,
                  target.heightMeters as Altitude.DHHN2016Meters
                )
              : transform.inverse(
                  coordinate,
                  target.heightMeters as Altitude.EllipsoidalWGS84Meters
                );
          conversion = height
            .then((value) => {
              if (value !== undefined) {
                if (convertedHeightsRef.current.size > 32)
                  convertedHeightsRef.current.clear();
                convertedHeightsRef.current.set(key, value);
                if (heightRefreshTimerRef.current === undefined)
                  heightRefreshTimerRef.current = window.setTimeout(() => {
                    heightRefreshTimerRef.current = undefined;
                    if (!activeRef.current) return;
                    setHeightResolutionRevision((revision) => revision + 1);
                    if (!lockedRef.current)
                      void refreshRef
                        .current({ immediate: true })
                        .catch(() => undefined);
                  }, 0);
              }
              return value;
            })
            .catch(() => undefined)
            .finally(() => {
              convertingHeightsRef.current.delete(key);
            });
          convertingHeightsRef.current.set(key, conversion);
        }
      }
      return {
        target,
        headingRad: heading,
        pitchRad: pitch,
        cameraView:
          args.cameraView === "oblique"
            ? undefined
            : args.cameraView ?? (mode === "nadir" ? "nadir" : undefined),
        selectionStrategy,
        numCandidates: args.numCandidates ?? numNearestImages,
        maxDistanceMeters,
        perSeriesTargetHeightMeters,
        excludeImageId: args.excludeImageId,
        navigationOrigin: args.navigationOrigin,
        navigationSelection: args.navigationSelection,
        navigationArrow: args.navigationArrow,
      };
    },
    [
      map,
      data,
      headingOffsetRad,
      numNearestImages,
      maxDistanceMeters,
      selectionStrategy,
      heightResolutionRevision,
    ]
  );

  const refreshSearch = useCallback(
    async (
      args?: RefreshSearchArgs
    ): Promise<NearestObliqueImageRecord[] | undefined> => {
      const client = searchRef.current;
      if (!map || !data || client?.data !== data) return undefined;
      const computeOnly = args?.computeOnly === true;
      if (lockedRef.current && !computeOnly) return undefined;
      const hasHeadingOverride =
        typeof args?.headingRad === "number" || args?.direction !== undefined;
      const now = Date.now();
      if (
        !hasHeadingOverride &&
        !args?.immediate &&
        now - lastSearchTimeRef.current < debounceMs
      )
        return undefined;
      lastSearchTimeRef.current = now;
      const requestId = ++requestIdRef.current,
        mode = modeRef.current;
      const query = await buildQuery(args ?? {}, mode);
      if (
        !query ||
        !activeRef.current ||
        requestId !== requestIdRef.current ||
        dataRef.current !== data ||
        modeRef.current !== mode
      )
        return undefined;
      const ranked = await client.search.query(query);
      if (
        !ranked ||
        !activeRef.current ||
        requestId !== requestIdRef.current ||
        dataRef.current !== data ||
        modeRef.current !== mode
      )
        return undefined;
      if (!computeOnly) {
        if (lockedRef.current) return undefined;
        onCandidatesRef.current?.(ranked);
        const next = ranked[0] ?? null;
        if ((next?.record.id ?? null) !== selectedIdRef.current)
          onSelectRef.current(next);
      }
      return ranked;
    },
    [map, data, buildQuery, debounceMs]
  );

  const computeNavigation = useCallback(
    async (args: RefreshSearchArgs[]): Promise<ImageSelectionBatchResult> => {
      if (args.length > MAX_IMAGE_SELECTION_BATCH_SIZE)
        throw new RangeError("Image navigation batch exceeds twelve queries.");
      const empty = (): ImageSelectionBatchResult => args.map(() => undefined);
      const client = searchRef.current,
        generation = ++navigationGenerationRef.current,
        mode = modeRef.current;
      if (!map || !data || client?.data !== data) return empty();
      const queries = await Promise.all(
        args.map((query) =>
          buildQuery(
            {
              ...query,
              numCandidates: Math.max(1, Math.min(4, query.numCandidates ?? 4)),
            },
            mode
          )
        )
      );
      if (
        !activeRef.current ||
        generation !== navigationGenerationRef.current ||
        dataRef.current !== data ||
        queries.some((query) => !query)
      )
        return empty();
      const ranked = await client.search.queryBatch(
        queries as ObliqueViewQuery[]
      );
      if (
        !activeRef.current ||
        generation !== navigationGenerationRef.current ||
        dataRef.current !== data
      )
        return empty();
      return ranked.map((candidates, index) =>
        // Image-to-image navigation moves to the neighbor's own footprint.
        // Only pivot-preserving searches require coverage of the old target.
        queries[index]?.navigationOrigin || queries[index]?.navigationSelection
          ? candidates
          : candidates?.filter((candidate) => candidate.coversTarget)
      );
    },
    [map, data, buildQuery]
  );

  refreshRef.current = refreshSearch;

  useEffect(() => {
    if (!map || !enabled || !data || locked) return undefined;
    let timerId: number | undefined;
    const onMove = () => {
      requestIdRef.current++;
      window.clearTimeout(timerId);
      timerId = window.setTimeout(() => {
        void refreshRef.current();
      }, debounceMs);
    };
    const onMoveEnd = () => {
      window.clearTimeout(timerId);
      void refreshRef.current({ immediate: true });
    };
    map.on("move", onMove);
    map.on("moveend", onMoveEnd);
    void refreshRef.current({ immediate: true });
    return () => {
      window.clearTimeout(timerId);
      map.off("move", onMove);
      map.off("moveend", onMoveEnd);
    };
  }, [map, enabled, data, locked, debounceMs, selectionStrategy]);

  return { refreshSearch, computeNavigation };
};
