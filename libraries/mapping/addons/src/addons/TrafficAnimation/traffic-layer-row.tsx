import { useEffect, useMemo, useRef, type CSSProperties } from "react";

import type { Layer } from "@carma-mapping/layers";
import { trafficClockOf } from "@carma-mapping/show-remote";

import { useTrafficAnimationActions } from "./traffic-actions";

export const TRAFFIC_ANIMATION_LAYER_ID = "__trafficAnimation__";

/** the ribbon the readout opens, registered by the host */
export const TRAFFIC_TOOLS_INTERACTION_ID = "traffic-animation-tools";

/** pulls the readout away from the title and towards the buttons */
const READOUT_STYLE: CSSProperties = {
  marginLeft: "6px",
  paddingLeft: "8px",
  borderLeft: "1px solid rgb(0 0 0 / 0.12)",
};

/**
 * The traffic's controls in the layer bar.
 *
 * A layer always launches the traffic (`getLayerLaunchedAddons`), so this is
 * never a row of its own: `permanent` makes the host put the readout on the
 * launching layer's button (`useLauncherCarriedControls`), whose ✕ and eye
 * already end and hide the traffic. What is left for the readout is to say
 * which moment is shown and to open the ribbon.
 */
export const TRAFFIC_ANIMATION_LAYER: Layer = {
  id: TRAFFIC_ANIMATION_LAYER_ID,
  title: "Verkehr",
  type: "object",
  visible: true,
  permanent: true,
  pinned: "first",
  skipSelection: true,
};

/** "Live", or the time of day the traffic shows, e.g. "23:05" */
export const trafficReadout = (
  offsetMinutes: number,
  displayedAt: number,
  now: number = Date.now()
): string => {
  if (offsetMinutes <= 0) return "Live";
  const minutes = Math.floor(
    trafficClockOf(displayedAt || now - offsetMinutes * 60_000).minutes
  );
  const hours = String(Math.floor(minutes / 60)).padStart(2, "0");
  return `${hours}:${String(minutes % 60).padStart(2, "0")}`;
};

export type UseTrafficAnimationLayerRowOptions = {
  /** whether the host currently shows the controls */
  hasRow: boolean;
  /** whether this route mounts the addon that drives the traffic */
  hasEngine: boolean;
  /**
   * Whether a layer in the stack launched the traffic. Its button is where
   * the controls go; without one there is nowhere to put them.
   */
  hasLauncher: boolean;
  onAdd: (layer: Layer) => void;
  onRemove: (id: string) => void;
  /** the host keeps a snapshot, so a changed readout has to be handed over again */
  onUpdate?: (layer: Layer) => void;
};

/**
 * Keeps the controls and the traffic in step. The controls belong to the
 * host: the addon only says when they should appear and what they contain, so
 * no store reaches into this library.
 */
export const useTrafficAnimationLayerRow = ({
  hasRow,
  hasEngine,
  hasLauncher,
  onAdd,
  onRemove,
  onUpdate,
}: UseTrafficAnimationLayerRowOptions) => {
  const { isOn, title, offsetMinutes, displayedAt } =
    useTrafficAnimationActions();

  const label = trafficReadout(offsetMinutes, displayedAt);

  const layer = useMemo(
    () => ({
      ...TRAFFIC_ANIMATION_LAYER,
      title,
      interactionButtons: [
        {
          id: TRAFFIC_TOOLS_INTERACTION_ID,
          icon: (
            <span className="tabular-nums" style={READOUT_STYLE}>
              {label}
            </span>
          ),
          tooltip: "Verkehr einstellen",
        },
      ],
    }),
    [title, label]
  );
  const layerRef = useRef(layer);
  layerRef.current = layer;

  const onAddRef = useRef(onAdd);
  onAddRef.current = onAdd;
  const onRemoveRef = useRef(onRemove);
  onRemoveRef.current = onRemove;
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  // the readout moves with the clock and the slider, so the row goes stale
  useEffect(() => {
    if (hasEngine && hasRow) {
      onUpdateRef.current?.(layer);
    }
  }, [hasEngine, hasRow, layer]);

  /** what we last asked the host for, so a re-render before the host's state
   *  catches up does not send the same request twice */
  const requestedRef = useRef<"add" | "remove" | null>(null);

  // No ✕ of its own to watch: the launching layer's ✕ takes the layer out of
  // the stack, which unmounts the engine, which ends here as `isOn` false.
  useEffect(() => {
    const shouldShow = hasEngine && hasLauncher && isOn;
    if (shouldShow === hasRow) {
      requestedRef.current = null;
      return;
    }
    if (shouldShow && requestedRef.current !== "add") {
      requestedRef.current = "add";
      onAddRef.current(layerRef.current);
      return;
    }
    if (!shouldShow && requestedRef.current !== "remove") {
      requestedRef.current = "remove";
      onRemoveRef.current(TRAFFIC_ANIMATION_LAYER_ID);
    }
  }, [hasEngine, hasLauncher, hasRow, isOn]);
};
