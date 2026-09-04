import { useEffect, useRef } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";

import { coveringGroup } from "./annotation-zoom-coverage";
import type { AnnotationGroup } from "./types";

export type UseZoomRoutingOptions = {
  libreMap: MaplibreMap | null;
  /** off while the addon is not drawing, so browsing the map changes nothing */
  enabled: boolean;
  groups: AnnotationGroup[];
  activeId: string;
  pickGroup: (id: string) => void;
  addGroup: () => void;
};

/**
 * Points the pencil at the drawing that owns the zoom the map is at. Where one
 * does, a stroke joins it; where none does, an untouched drawing is held ready
 * instead — it follows the camera at 100 %, and only the first stroke turns it
 * into a drawing of its own, see `AnnotationOverlay`.
 *
 * Only a change of zoom routes: panning must not move the pencil, and neither
 * must picking a drawing from the toolbar.
 */
export const useZoomRouting = ({
  libreMap,
  enabled,
  groups,
  activeId,
  pickGroup,
  addGroup,
}: UseZoomRoutingOptions) => {
  const stateRef = useRef({ groups, activeId, pickGroup, addGroup });
  stateRef.current = { groups, activeId, pickGroup, addGroup };
  const zoomRef = useRef<number | null>(null);

  useEffect(() => {
    if (!libreMap || !enabled) {
      return;
    }
    const route = (zoomed: boolean) => {
      const zoom = libreMap.getZoom();
      if (!zoomed && zoom === zoomRef.current) {
        return;
      }
      zoomRef.current = zoom;

      const current = stateRef.current;
      const owner = coveringGroup(current.groups, zoom);
      if (owner) {
        if (owner.id !== current.activeId) {
          current.pickGroup(owner.id);
        }
        return;
      }
      const spare = current.groups.find((group) => !group.coverage);
      if (!spare) {
        current.addGroup();
        return;
      }
      if (spare.id !== current.activeId) {
        current.pickGroup(spare.id);
      }
    };
    // the groups changed under us, so decide again whatever the zoom is
    route(true);
    const onMoveEnd = () => route(false);
    libreMap.on("moveend", onMoveEnd);
    return () => {
      libreMap.off("moveend", onMoveEnd);
    };
  }, [activeId, enabled, groups, libreMap]);
};
