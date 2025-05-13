import { useEffect, useRef } from "react";

import { SelectionItem, useSelection } from "../components/SelectionProvider";
import maplibregl from "maplibre-gl";
import proj4 from "proj4";
import { proj4crs3857def, proj4crs4326def } from "@carma-mapping/utils";

const NEW_SELECTION_TIMEOUT = 200;

type SelectionTopicMapOptions = {
  map?: maplibregl.Map;
  onComplete?: (selection: SelectionItem) => void;
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
        console.debug("HOOK: useSelectionTopicMap - same selection, skipping");
        return;
      }
      lastSelectionKey.current = selection.sorter;
      lastSelectionTimestamp.current = selection.selectionTimestamp;
      const isNewSelection =
        selection?.selectionTimestamp &&
        Date.now() - selection.selectionTimestamp < NEW_SELECTION_TIMEOUT;
      if (selection && isNewSelection) {
        console.debug(
          "HOOK: useSelectionTopicMap selection LEAFLET",
          selection
        );
        const pos = proj4(proj4crs3857def, proj4crs4326def, [
          selection.x,
          selection.y,
        ]);

        if (map) {
          map.flyTo({
            center: [pos[0], pos[1]],
            animate: false,
          });

          if (selection.more.zl) {
            map.setZoom(selection.more.zl - 1);
          }
        }

        onComplete?.(selection);
      }
    }
  }, [selection, setSelection, setOverlayFeature]);
};
