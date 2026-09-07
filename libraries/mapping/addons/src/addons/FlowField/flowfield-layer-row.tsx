import { useEffect, useMemo, useRef, type CSSProperties } from "react";

import type { InteractionButton, Layer } from "@carma-mapping/layers";

import { useFlowFieldActions } from "./flowfield-actions";

export const FLOW_FIELD_LAYER_ID = "__flowField__";

/** the readout the row shows instead of opening anything */
export const FLOW_FIELD_STATUS_ID = "flow-field-status";

const ICON_COLOR = { running: "#1677ff", idle: "#8c8c8c" };

/** pulls the readout away from the title and towards the buttons */
const READOUT_STYLE: CSSProperties = {
  marginLeft: "6px",
  paddingLeft: "8px",
  borderLeft: "1px solid rgb(0 0 0 / 0.12)",
  fontSize: "11px",
};

/**
 * The row the layer bar shows while the animation is on the map. Same shape as
 * the time series' row, so a route's tools read as one family.
 *
 * It has no ribbon and no play control. The animation has no position to scrub
 * and nothing to pause towards, so the row's whole job is to say the animation
 * is on, say why it is not moving when it is not, and switch it off.
 */
export const FLOW_FIELD_LAYER: Layer = {
  id: FLOW_FIELD_LAYER_ID,
  title: "Fließwege",
  type: "object",
  icon: "flowField",
  iconColor: ICON_COLOR.running,
  visible: true,
  pinned: "last",
  skipSelection: true,
};

/**
 * What the readout says.
 *
 * The zoom gate is the one thing a visitor has to be told about: below it the
 * row is there, the layer is mounted, and nothing moves, which without a word
 * reads as broken rather than as deliberate.
 */
const statusLabel = ({
  isCaged,
  isActive,
  isLoading,
  hasFallback,
}: {
  isCaged: boolean;
  isActive: boolean;
  isLoading: boolean;
  /** a WMS stands in for the animation while cage is absent */
  hasFallback: boolean;
}): string => {
  if (!isCaged) return hasFallback ? "Richtungspfeile" : "nicht verfügbar";
  if (!isActive) return "näher heranzoomen";
  if (isLoading) return "lädt";
  return "läuft";
};

const buildInteractionButtons = (label: string): InteractionButton[] => [
  {
    id: FLOW_FIELD_STATUS_ID,
    icon: <span style={READOUT_STYLE}>{label}</span>,
    tooltip: "Zustand der Fließwege-Animation",
  },
];

export type UseFlowFieldLayerRowOptions = {
  /** whether the host currently shows the row */
  hasRow: boolean;
  /**
   * Whether this route mounts the addon that draws the animation. A row that
   * outlived its route has nothing behind it and is dropped.
   */
  hasEngine: boolean;
  onAdd: (layer: Layer) => void;
  onRemove: (id: string) => void;
  /** the host keeps a snapshot, so a changed row has to be handed over again */
  onUpdate?: (layer: Layer) => void;
};

/**
 * Keeps the row and the animation in step. The row belongs to the host: the
 * addon only says when it should appear and what it contains, so no store
 * reaches into this library.
 */
export const useFlowFieldLayerRow = ({
  hasRow,
  hasEngine,
  onAdd,
  onRemove,
  onUpdate,
}: UseFlowFieldLayerRowOptions) => {
  const { isOn, setOn, title, isCaged, isActive, isLoading, fallback } =
    useFlowFieldActions();

  const label = statusLabel({
    isCaged,
    isActive,
    isLoading,
    hasFallback: Boolean(fallback),
  });

  const layer = useMemo(
    () => ({
      ...FLOW_FIELD_LAYER,
      title,
      iconColor: isActive && isCaged ? ICON_COLOR.running : ICON_COLOR.idle,
      interactionButtons: buildInteractionButtons(label),
    }),
    [title, label, isActive, isCaged]
  );

  const layerRef = useRef(layer);
  layerRef.current = layer;

  const onAddRef = useRef(onAdd);
  onAddRef.current = onAdd;
  const onRemoveRef = useRef(onRemove);
  onRemoveRef.current = onRemove;
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  // the readout changes as the map crosses the zoom gate, so the row goes stale
  useEffect(() => {
    if (hasEngine && hasRow) {
      onUpdateRef.current?.(layer);
    }
  }, [hasEngine, hasRow, layer]);

  const prevRef = useRef({ isOn, hasRow });
  /** what we last asked the host for, so a re-render before the host's state
   *  catches up does not send the same request twice */
  const requestedRef = useRef<"add" | "remove" | null>(null);
  /** the warning is about the route's configuration, so once is enough */
  const warnedRef = useRef(false);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = { isOn, hasRow };

    // No engine on this route: nothing can draw the animation, so the row goes
    // instead of offering a control with nothing behind it.
    if (!hasEngine) {
      if (hasRow) {
        if (!warnedRef.current) {
          warnedRef.current = true;
          console.warn(
            '[ADDON STATE] a flow-field row reached a route that mounts no "flowField" ' +
              "addon; dropping the row. A route that offers the animation has to declare the addon."
          );
        }
        requestedRef.current = null;
        onRemoveRef.current(FLOW_FIELD_LAYER_ID);
      }
      return;
    }

    // removed via the row's ✕ while the animation is still on the map
    if (isOn && !hasRow && prev.hasRow) {
      requestedRef.current = null;
      setOn(false);
      return;
    }

    if (isOn === hasRow) {
      requestedRef.current = null;
      return;
    }

    if (isOn && requestedRef.current !== "add") {
      requestedRef.current = "add";
      onAddRef.current(layerRef.current);
      return;
    }

    if (!isOn && requestedRef.current !== "remove") {
      requestedRef.current = "remove";
      onRemoveRef.current(FLOW_FIELD_LAYER_ID);
    }
  }, [hasEngine, hasRow, isOn, setOn]);
};
