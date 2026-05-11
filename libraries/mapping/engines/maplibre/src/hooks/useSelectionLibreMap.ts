import { useEffect, useRef } from "react";

import * as turfHelpers from "@turf/helpers";
import maplibregl from "maplibre-gl";
import proj4 from "proj4";

import { proj4crs3857def, proj4crs4326def } from "@carma-mapping/utils";
// Import from portals - SelectionProvider is a shared concern
import { SelectionItem, useSelection } from "@carma-appframeworks/portals";

const NEW_SELECTION_TIMEOUT = 200;

type SetZoomFromSelectionSourceZoom = (selectionSourceZoom: number) => void;

type SelectionTopicMapOptions = {
  map?: maplibregl.Map | null;
  setZoomFromSelectionSourceZoom: SetZoomFromSelectionSourceZoom;
  onComplete?: (
    selection: SelectionItem,
    triggerVisibilityChange?: boolean
  ) => void;
};

export const useSelectionLibreMap = ({
  map,
  setZoomFromSelectionSourceZoom,
  onComplete,
}: SelectionTopicMapOptions) => {
  const { selection, setOverlayFeature } = useSelection();
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

          if (typeof selection.more.zl === "number") {
            setZoomFromSelectionSourceZoom(selection.more.zl);
          } else if (selection.more.g) {
            const feature = turfHelpers.feature(selection.more.g);
            setOverlayFeature(feature);
          }
        }

        setTimeout(() => {
          onComplete?.(selection, true);
        }, 40);
      }
    }
  }, [
    selection,
    setOverlayFeature,
    map,
    setZoomFromSelectionSourceZoom,
    onComplete,
  ]);
};
