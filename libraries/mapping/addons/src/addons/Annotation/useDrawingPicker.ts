import { useCallback, useEffect, useRef } from "react";

/** whether one scene has an element under a client point */
export type SceneProbe = (clientX: number, clientY: number) => boolean;

export type UseDrawingPickerOptions = {
  /** the map wrapper; the map canvas and every scene sit inside it */
  host: HTMLElement | null;
  enabled: boolean;
  /** scene ids in stacking order, oldest first */
  order: string[];
  activeId: string;
  /** false while a shape tool is selected, where the click starts a shape */
  armed: boolean;
  onPick: (id: string) => void;
};

/**
 * Click a locked drawing to reactivate it.
 *
 * Locked scenes take no pointer events and the editable one covers the rest, so
 * a single capture-phase listener on the wrapper is the only place that sees
 * both. It stops the click only when it picks something up, leaving the map's
 * own click handling intact.
 *
 * Returns the registration callback the scenes pass their hit test to.
 */
export const useDrawingPicker = ({
  host,
  enabled,
  order,
  activeId,
  armed,
  onPick,
}: UseDrawingPickerOptions) => {
  const probes = useRef(new Map<string, SceneProbe>());

  const registerProbe = useCallback((id: string, probe: SceneProbe | null) => {
    if (probe) {
      probes.current.set(id, probe);
    } else {
      probes.current.delete(id);
    }
  }, []);

  // read at click time, so the listener is not rebuilt on every change
  const latest = useRef({ order, activeId, armed, onPick });
  latest.current = { order, activeId, armed, onPick };

  useEffect(() => {
    if (!host || !enabled) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      const current = latest.current;
      if (!current.armed) {
        return;
      }
      // a click on the active drawing belongs to it
      if (
        probes.current.get(current.activeId)?.(event.clientX, event.clientY)
      ) {
        return;
      }
      // topmost first
      for (let index = current.order.length - 1; index >= 0; index -= 1) {
        const id = current.order[index];
        if (id === current.activeId) {
          continue;
        }
        if (probes.current.get(id)?.(event.clientX, event.clientY)) {
          event.preventDefault();
          event.stopPropagation();
          current.onPick(id);
          return;
        }
      }
    };

    host.addEventListener("pointerdown", onPointerDown, true);
    return () => host.removeEventListener("pointerdown", onPointerDown, true);
  }, [enabled, host]);

  return registerProbe;
};
