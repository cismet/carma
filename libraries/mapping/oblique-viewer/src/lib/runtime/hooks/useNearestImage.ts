import { useCallback, useEffect, useRef } from "react";
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
} from "../../core/types";
import { getHeadingFromCardinalDirection } from "../../core/utils/orientation";
import {
  createImageSelectionSearch,
  type ImageSelectionSearch,
} from "../utils/image-selection";
import type { ObliqueData } from "./useObliqueData";

/** Continuous camera/target geometry ranks candidates from every loaded enabled series. */
export type RefreshSearchArgs = {
  /** search this sector rather than the camera's */
  direction?: CardinalDirection;
  /** search for this heading rather than the camera's, radians */
  headingRad?: number;
  pitchRad?: number;
  cameraView?: "nadir";
  target?: ObliqueGroundTarget;
  /** skip the debounce */
  immediate?: boolean;
  /** return the ranking without touching the selection */
  computeOnly?: boolean;
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
  debounceMs = 150,
}: UseNearestImageOptions) => {
  const modeRef = useRef(viewMode);
  modeRef.current = viewMode;
  const activeRef = useRef(true);
  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
    };
  }, []);
  const searchRef = useRef<{
    data: ObliqueData;
    search: ImageSelectionSearch;
  } | null>(null);
  const requestIdRef = useRef(0);
  const dataRef = useRef(data);
  dataRef.current = data;
  useEffect(() => {
    requestIdRef.current++;
    if (!data) return undefined;
    const search = createImageSelectionSearch(data);
    searchRef.current = { data, search };
    return () => {
      requestIdRef.current++;
      searchRef.current = null;
      search.dispose();
    };
  }, [data]);
  useEffect(() => {
    requestIdRef.current++;
  }, [map, enabled, locked, viewMode]);
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

  const refreshSearch = useCallback(
    async (
      args?: RefreshSearchArgs
    ): Promise<NearestObliqueImageRecord[] | undefined> => {
      const client = searchRef.current;
      if (!map || !data || client?.data !== data) return undefined;
      const computeOnly = args?.computeOnly === true;
      if (lockedRef.current && !computeOnly) return undefined;

      const overrideHeading =
        typeof args?.headingRad === "number"
          ? args.headingRad
          : args?.direction !== undefined
          ? getHeadingFromCardinalDirection(args.direction) + headingOffsetRad
          : null;
      const now = Date.now();
      if (
        overrideHeading === null &&
        !args?.immediate &&
        now - lastSearchTimeRef.current < debounceMs
      ) {
        return undefined;
      }
      lastSearchTimeRef.current = now;
      const requestId = ++requestIdRef.current;
      const mode = modeRef.current;

      const heading = overrideHeading ?? degToRadNumeric(map.getBearing());
      const pitch = args?.pitchRad ?? degToRadNumeric(map.getPitch());
      const center = map.getCenter();
      const target = args?.target ?? {
        longitude: center.lng,
        latitude: center.lat,
        heightMeters: map.queryTerrainElevation(center) ?? undefined,
        heightDatum: "dhhn2016" as const,
      };
      const heightKey = `${target.longitude}|${target.latitude}|${target.heightMeters}|${target.heightDatum}`;
      const perSeriesTargetHeightMeters = new Map<string, number>();
      const conversions: Promise<void>[] = [];
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
              if (convertedHeightsRef.current.size > 32)
                convertedHeightsRef.current.clear();
              convertedHeightsRef.current.set(key, value);
              return value;
            })
            .catch(() => undefined)
            .finally(() => {
              convertingHeightsRef.current.delete(key);
            });
          convertingHeightsRef.current.set(key, conversion);
        }
        conversions.push(
          conversion.then((height) => {
            if (height !== undefined)
              perSeriesTargetHeightMeters.set(id, height);
          })
        );
      }
      if (conversions.length) await Promise.all(conversions);
      if (
        !activeRef.current ||
        requestId !== requestIdRef.current ||
        dataRef.current !== data ||
        modeRef.current !== mode
      )
        return undefined;
      const ranked = await client.search.query({
        target,
        headingRad: heading,
        pitchRad: pitch,
        cameraView:
          args?.cameraView ?? (mode === "nadir" ? "nadir" : undefined),
        numCandidates: numNearestImages,
        maxDistanceMeters,
        perSeriesTargetHeightMeters,
      });

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
        if ((next?.record.id ?? null) !== selectedIdRef.current) {
          onSelectRef.current(next);
        }
      }
      return ranked;
    },
    [
      map,
      data,
      headingOffsetRad,
      numNearestImages,
      maxDistanceMeters,
      debounceMs,
    ]
  );

  const refreshRef = useRef(refreshSearch);
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
  }, [map, enabled, data, locked, debounceMs]);

  return refreshSearch;
};
