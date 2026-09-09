import { useCallback, useEffect, useRef } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";

import type {
  CardinalDirection,
  NearestObliqueImageRecord,
  ObliqueDataset,
} from "../types";
import {
  wgs84ToDatasetXY,
  type DatasetConverter,
} from "../utils/imageRecord";
import {
  degToRad,
  getCardinalDirectionFromHeading,
  getHeadingFromCardinalDirection,
} from "../utils/orientation";
import { nearestInSector } from "../utils/spatialIndexing";
import type { ObliqueData } from "./useObliqueData";

/**
 * Which image the map centre falls into.
 *
 * The camera's bearing, less the flight's rotation, says which sector was
 * shot looking this way; the footprint centres of that sector nearest to
 * the map centre are ranked and the first becomes the selection. Runs
 * debounced on every move while the viewer browses, and on demand with a
 * sector or heading of its own for the turns.
 */

export type RefreshSearchArgs = {
  /** search this sector rather than the camera's */
  direction?: CardinalDirection;
  /** search for this heading rather than the camera's, radians */
  headingRad?: number;
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
  converter: DatasetConverter;
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
  converter,
  locked,
  selectedImageId,
  onSelect,
  debounceMs = 150,
}: UseNearestImageOptions) => {
  const lastSearchTimeRef = useRef(0);
  const selectedIdRef = useRef(selectedImageId);
  selectedIdRef.current = selectedImageId;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const lockedRef = useRef(locked);
  lockedRef.current = locked;

  const headingOffsetRad = degToRad(dataset.headingOffsetDeg);
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

      const heading = overrideHeading ?? degToRad(map.getBearing());
      const sector = getCardinalDirectionFromHeading(heading - headingOffsetRad);

      const center = map.getCenter();
      const [x, y] = wgs84ToDatasetXY(converter, center.lng, center.lat);

      const ranked: NearestObliqueImageRecord[] = [];
      for (const item of nearestInSector(
        data.centerTrees,
        sector,
        x,
        y,
        numNearestImages
      )) {
        const record = data.imageRecords.get(item.id);
        if (!record) continue;
        const distanceToCamera = Math.hypot(x - record.x, y - record.y);
        if (distanceToCamera > maxDistanceMeters) continue;
        ranked.push({
          record,
          distanceOnGround: Math.hypot(x - item.x, y - item.y),
          distanceToCamera,
          imageCenter: {
            x: item.x,
            y: item.y,
            longitude: item.longitude,
            latitude: item.latitude,
            cardinal: item.cardinal,
          },
        });
      }

      if (!computeOnly) {
        const next = ranked[0] ?? null;
        if ((next?.record.id ?? null) !== selectedIdRef.current) {
          onSelectRef.current(next);
        }
      }
      return ranked;
    },
    [map, data, converter, headingOffsetRad, numNearestImages, maxDistanceMeters, debounceMs]
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
