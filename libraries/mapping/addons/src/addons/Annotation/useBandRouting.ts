import { useEffect, useRef } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";

import { bandOf } from "./annotation-zoom-bands";
import type { AnnotationGroup } from "./types";

export type UseBandRoutingOptions = {
  libreMap: MaplibreMap | null;
  /** off while the addon is not drawing, so browsing the map adds nothing */
  enabled: boolean;
  groups: AnnotationGroup[];
  activeId: string;
  /** the map zoom band 0 begins at; unset until something has been drawn */
  origin?: number;
  /** how many zoom levels one drawing covers */
  span: number;
  /** whether a drawing carries shapes, so its anchor may not be moved */
  isFilled: (id: string) => boolean;
  pickGroup: (id: string) => void;
  assignBand: (id: string, band: number) => void;
  addGroup: (band: number) => void;
};

/**
 * Routes the zoom axis to drawings. Every band belongs to exactly one drawing,
 * so zooming through them hands over between the drawings that are already
 * there, and only where no drawing lives yet is one started.
 *
 * It watches the map, never the pick: opening a drawing from the toolbar must
 * not be able to start another one, whatever zoom the map is at.
 */
export const useBandRouting = ({
  libreMap,
  enabled,
  groups,
  activeId,
  origin,
  span,
  isFilled,
  pickGroup,
  assignBand,
  addGroup,
}: UseBandRoutingOptions) => {
  const stateRef = useRef({
    groups,
    activeId,
    origin,
    span,
    isFilled,
    pickGroup,
    assignBand,
    addGroup,
  });
  stateRef.current = {
    groups,
    activeId,
    origin,
    span,
    isFilled,
    pickGroup,
    assignBand,
    addGroup,
  };
  const bandRef = useRef<number | null>(null);

  useEffect(() => {
    if (!libreMap || !enabled) {
      return;
    }
    const route = () => {
      const current = stateRef.current;
      if (current.origin === undefined || !(current.span > 0)) {
        return;
      }
      const band = bandOf(libreMap.getZoom(), current.origin, current.span);
      const active = current.groups.find(
        (group) => group.id === current.activeId
      );
      // a drawing without a band still needs one, e.g. after a delete
      if (band === bandRef.current && active?.band !== undefined) {
        return;
      }
      bandRef.current = band;

      const owner = current.groups.find((group) => group.band === band);
      if (owner) {
        if (owner.id !== current.activeId) {
          current.pickGroup(owner.id);
        }
        return;
      }
      // an untouched drawing simply follows along, so roaming adds nothing
      const spare = [active, ...current.groups].find(
        (group) => group && !current.isFilled(group.id)
      );
      if (spare) {
        current.assignBand(spare.id, band);
        return;
      }
      current.addGroup(band);
    };
    route();
    libreMap.on("moveend", route);
    return () => {
      libreMap.off("moveend", route);
    };
  }, [activeId, enabled, groups, libreMap, origin, span]);
};
