import { useEffect, useRef } from "react";

import * as turfHelpers from "@turf/helpers";
import maplibregl from "maplibre-gl";
import proj4 from "proj4";

import { proj4crs3857def, proj4crs4326def } from "@carma-mapping/utils";
// Import from portals - SelectionProvider is a shared concern
import { SelectionItem, useSelection } from "@carma-appframeworks/portals";

const NEW_SELECTION_TIMEOUT = 200;

const FIT_BOUNDS_PADDING = 60;

/** a hit the user just picked: the map is settled, the query can follow right away */
const NEW_SELECTION_COMPLETE_DELAY_MS = 40;

/**
 * A restored hit arrives together with the layers of the same shared
 * configuration, so the style is still growing when it lands. Waiting for the
 * layer list to stop changing keeps the gazetteer query from running against
 * layers that are not in the style yet.
 */
const SETTLE_INTERVAL_MS = 150;
const SETTLE_MAX_WAIT_MS = 10000;

type CancelableRun = { cancel: () => void };

const runWhenMapSettled = (
  map: maplibregl.Map,
  run: () => void
): CancelableRun => {
  let cancelled = false;
  let timeoutId: number | null = null;
  let lastLayerCount = -1;
  const startedAt = Date.now();

  const getLayerCount = () => {
    try {
      return map.getStyle()?.layers?.length ?? -1;
    } catch {
      // the style can be gone mid-teardown, which is not a layer count
      return -1;
    }
  };

  const check = () => {
    if (cancelled) {
      return;
    }
    const layerCount = getLayerCount();
    const isSettled =
      map.loaded() && layerCount > 0 && layerCount === lastLayerCount;
    lastLayerCount = layerCount;
    if (isSettled || Date.now() - startedAt > SETTLE_MAX_WAIT_MS) {
      timeoutId = null;
      run();
      return;
    }
    timeoutId = window.setTimeout(check, SETTLE_INTERVAL_MS);
  };

  timeoutId = window.setTimeout(check, SETTLE_INTERVAL_MS);

  return {
    cancel: () => {
      cancelled = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }
    },
  };
};

const getGeometryBoundsWgs84 = (
  geometry: turfHelpers.Geometry
): maplibregl.LngLatBoundsLike | null => {
  const coordinates = (geometry as { coordinates?: unknown }).coordinates;
  if (!coordinates) {
    return null;
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const visit = (node: unknown) => {
    if (!Array.isArray(node)) {
      return;
    }
    if (typeof node[0] === "number" && typeof node[1] === "number") {
      minX = Math.min(minX, node[0]);
      minY = Math.min(minY, node[1]);
      maxX = Math.max(maxX, node[0]);
      maxY = Math.max(maxY, node[1]);
      return;
    }
    node.forEach(visit);
  };
  visit(coordinates);
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    return null;
  }
  const southWest = proj4(proj4crs3857def, proj4crs4326def, [minX, minY]);
  const northEast = proj4(proj4crs3857def, proj4crs4326def, [maxX, maxY]);
  return [
    [southWest[0], southWest[1]],
    [northEast[0], northEast[1]],
  ];
};

type SelectionTopicMapOptions = {
  map?: maplibregl.Map | null;
  onComplete?: (
    selection: SelectionItem,
    triggerVisibilityChange?: boolean
  ) => void;
};

export const useSelectionLibreMap = ({
  map,
  onComplete,
}: SelectionTopicMapOptions = {}) => {
  const { selection, setSelection, setOverlayFeature } = useSelection();
  const lastSelectionKey = useRef<number | null>(null);
  const lastSelectionTimestamp = useRef<number | null>(null);
  /** kept outside the effect lifecycle: onComplete is a new function on every
   * render of the caller, so an effect cleanup would cancel a pending wait */
  const pendingCompleteRef = useRef<CancelableRun | null>(null);

  useEffect(() => {
    if (selection === null) {
      console.debug("HOOK: clear overlay on empty selection", selection);
      setOverlayFeature(null);
      lastSelectionKey.current = null;
    }
  }, [selection, setOverlayFeature]);

  useEffect(() => {
    if (selection) {
      if (
        lastSelectionKey.current === selection.sorter &&
        lastSelectionTimestamp.current === selection.selectionTimestamp
      ) {
        console.debug("HOOK: useSelectionLibreMap - same selection, skipping");
        return;
      }
      const isNewSelection =
        selection?.selectionTimestamp &&
        Date.now() - selection.selectionTimestamp < NEW_SELECTION_TIMEOUT;
      // A hit restored from a shared configuration carries no timestamp. It
      // still has to reach onComplete, or the shared link shows the marker
      // without ever selecting what was shared. Its camera comes from the
      // hash, so this must not move the map.
      const isRestoredSelection = selection.selectionTimestamp === null;
      if (!isNewSelection && !isRestoredSelection) {
        return;
      }
      if (!map) {
        // the effect runs again once the map instance is there, so the
        // selection must not be marked as handled yet
        return;
      }
      lastSelectionKey.current = selection.sorter;
      lastSelectionTimestamp.current = selection.selectionTimestamp;
      console.debug(
        "HOOK: useSelectionLibreMap selection",
        selection,
        isRestoredSelection ? "(restored)" : ""
      );
      const pos = proj4(proj4crs3857def, proj4crs4326def, [
        selection.x,
        selection.y,
      ]);

      if (isRestoredSelection) {
        if (selection.more.g) {
          setOverlayFeature(turfHelpers.feature(selection.more.g));
        }
      } else {
        map.jumpTo({
          center: [pos[0], pos[1]],
        });

        if (selection.more.zl) {
          map.setZoom(selection.more.zl - 1);
        } else if (selection.more.g) {
          const feature = turfHelpers.feature(selection.more.g);
          setOverlayFeature(feature);
          if (!selection.isAreaSelection) {
            const bounds = getGeometryBoundsWgs84(selection.more.g);
            const camera = bounds
              ? map.cameraForBounds(bounds, { padding: FIT_BOUNDS_PADDING })
              : undefined;
            if (camera?.center && camera.zoom !== undefined) {
              map.jumpTo({
                center: camera.center,
                zoom: Math.floor(camera.zoom),
              });
            }
          }
        }
      }

      pendingCompleteRef.current?.cancel();
      if (isRestoredSelection) {
        pendingCompleteRef.current = runWhenMapSettled(map, () => {
          pendingCompleteRef.current = null;
          onComplete?.(selection, true);
        });
      } else {
        const timeoutId = window.setTimeout(() => {
          pendingCompleteRef.current = null;
          onComplete?.(selection, true);
        }, NEW_SELECTION_COMPLETE_DELAY_MS);
        pendingCompleteRef.current = {
          cancel: () => window.clearTimeout(timeoutId),
        };
      }
    }
  }, [selection, setSelection, setOverlayFeature, map, onComplete]);

  useEffect(
    () => () => {
      pendingCompleteRef.current?.cancel();
    },
    []
  );
};
