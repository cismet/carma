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
} from "../../core/types";
import { getHeadingFromCardinalDirection } from "../../core/utils/orientation";
import { rankImagesForView } from "../../core/utils/selection";
import type { ObliqueData } from "./useObliqueData";

/** Continuous camera/target geometry ranks candidates from every loaded enabled series. */
export type RefreshSearchArgs = {
  /** search this sector rather than the camera's */
  direction?: CardinalDirection;
  /** search for this heading rather than the camera's, radians */
  headingRad?: number;
  pitchRad?: number;
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
  data: ObliqueData | null;
  /** the selection is held (preview up, flight running); on-demand searches still compute */
  locked: boolean;
  selectedImageId: string | null;
  onSelect: (next: NearestObliqueImageRecord | null) => void;
  debounceMs?: number;
};

export const useNearestImage = ({
  map,
  enabled,
  dataset,
  data,
  locked,
  selectedImageId,
  onSelect,
  debounceMs = 150,
}: UseNearestImageOptions) => {
  const activeRef = useRef(true);
  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
    };
  }, []);
  const lastSearchTimeRef = useRef(0);
  const convertedHeightsRef = useRef(new Map<string, number>());
  const convertingHeightsRef = useRef(new Set<string>());
  const latestTargetKeyRef = useRef("");
  const selectedIdRef = useRef(selectedImageId);
  selectedIdRef.current = selectedImageId;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const lockedRef = useRef(locked);
  lockedRef.current = locked;

  const headingOffsetRad = degToRadNumeric(dataset.headingOffsetDeg);
  const { numNearestImages, maxDistanceMeters } = dataset;

  const refreshSearch = useCallback(
    (args?: RefreshSearchArgs): NearestObliqueImageRecord[] | undefined => {
      if (!map || !data) return undefined;
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

      const heading = overrideHeading ?? degToRadNumeric(map.getBearing());
      const center = map.getCenter();
      const target = args?.target ?? {
        longitude: center.lng,
        latitude: center.lat,
        heightMeters: map.queryTerrainElevation(center) ?? undefined,
        heightDatum: "dhhn2016" as const,
      };
      const heightKey = `${target.longitude}|${target.latitude}|${target.heightMeters}|${target.heightDatum}`;
      latestTargetKeyRef.current = heightKey;
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
        if (convertingHeightsRef.current.has(key)) continue;
        convertingHeightsRef.current.add(key);
        const coordinate = [
          target.longitude,
          target.latitude,
        ] as LngLatArray.deg;
        const transform = getGcg2016Wgs84VerticalTransformer();
        const conversion =
          target.heightDatum === "dhhn2016"
            ? transform.forward(
                coordinate,
                target.heightMeters as Altitude.DHHN2016Meters
              )
            : transform.inverse(
                coordinate,
                target.heightMeters as Altitude.EllipsoidalWGS84Meters
              );
        conversion
          .then((height) => {
            if (convertedHeightsRef.current.size > 32)
              convertedHeightsRef.current.clear();
            convertedHeightsRef.current.set(key, height);
            if (activeRef.current && latestTargetKeyRef.current === heightKey)
              refreshRef.current({ ...args, target, immediate: true });
          })
          .catch(() => {
            /* The incompatible-datum series remains excluded; no fabricated height. */
          })
          .finally(() => {
            convertingHeightsRef.current.delete(key);
          });
      }
      const ranked = rankImagesForView(data, {
        target,
        headingRad: heading,
        pitchRad: args?.pitchRad ?? degToRadNumeric(map.getPitch()),
        numCandidates: numNearestImages,
        maxDistanceMeters,
        perSeriesTargetHeightMeters,
      });

      if (!computeOnly) {
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
      window.clearTimeout(timerId);
      timerId = window.setTimeout(() => refreshRef.current(), debounceMs);
    };
    const onMoveEnd = () => {
      window.clearTimeout(timerId);
      refreshRef.current({ immediate: true });
    };
    map.on("move", onMove);
    map.on("moveend", onMoveEnd);
    refreshRef.current({ immediate: true });
    return () => {
      window.clearTimeout(timerId);
      map.off("move", onMove);
      map.off("moveend", onMoveEnd);
    };
  }, [map, enabled, data, locked, debounceMs]);

  return refreshSearch;
};
