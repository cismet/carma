import { useEffect, useRef } from "react";

import * as turfHelpers from "@turf/helpers";
import maplibregl from "maplibre-gl";
import proj4 from "proj4";

import { proj4crs3857def, proj4crs4326def } from "@carma-mapping/utils";
// Import from portals - SelectionProvider is a shared concern
import { SelectionItem, useSelection } from "@carma-appframeworks/portals";

const NEW_SELECTION_TIMEOUT = 200;

const FIT_BOUNDS_PADDING = 60;

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
      lastSelectionKey.current = selection.sorter;
      lastSelectionTimestamp.current = selection.selectionTimestamp;
      const isNewSelection =
        selection?.selectionTimestamp &&
        Date.now() - selection.selectionTimestamp < NEW_SELECTION_TIMEOUT;
      if (selection && isNewSelection) {
        console.debug("HOOK: useSelectionLibreMap selection", selection);
        const pos = proj4(proj4crs3857def, proj4crs4326def, [
          selection.x,
          selection.y,
        ]);

        if (map) {
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

        setTimeout(() => {
          onComplete?.(selection, true);
        }, 40);
      }
    }
  }, [selection, setSelection, setOverlayFeature, map, onComplete]);
};
