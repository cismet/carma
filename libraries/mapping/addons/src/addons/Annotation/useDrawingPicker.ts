import { useCallback, useEffect, useRef } from "react";

export type SceneProbe = (clientX: number, clientY: number) => boolean;

export type UseDrawingPickerOptions = {
  host: HTMLElement | null;
  enabled: boolean;
  order: string[];
  activeId: string;
  armed: boolean;
  onPick: (id: string) => void;
};

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
      if (
        probes.current.get(current.activeId)?.(event.clientX, event.clientY)
      ) {
        return;
      }
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
