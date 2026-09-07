import { useEffect, useMemo, useRef, type CSSProperties } from "react";

import type { InteractionButton, Layer } from "@carma-mapping/layers";

import { useFloodActions } from "./flood-actions";

export const FLOOD_LAYER_ID = "__floodSimulation__";

/** the panel the row opens, registered by the host */
export const FLOOD_TOOLS_INTERACTION_ID = "flood-simulation-tools";

/** blue while the panel is open, black while it is not */
export const FLOOD_ICON_COLOR = { open: "#1677ff", closed: "#000000" };

/** pulls the readout away from the title and towards the buttons */
const READOUT_STYLE: CSSProperties = {
  marginLeft: "6px",
  paddingLeft: "8px",
  borderLeft: "1px solid rgb(0 0 0 / 0.12)",
};

/**
 * The row the layer bar shows while the flood is on the map: the title and
 * the water level, which opens the slider. Same shape as the time series' row,
 * so a route's tools read as one family.
 */
export const FLOOD_LAYER: Layer = {
  id: FLOOD_LAYER_ID,
  title: "Hochwasser",
  type: "object",
  icon: "flood",
  iconColor: FLOOD_ICON_COLOR.closed,
  visible: true,
  pinned: "last",
  skipSelection: true,
  rowClickInteractionId: FLOOD_TOOLS_INTERACTION_ID,
};

const buildInteractionButtons = (label: string): InteractionButton[] => [
  {
    // same id as `rowClickInteractionId`, so the readout is lit while the
    // panel is open and clicking it closes the panel again
    id: FLOOD_TOOLS_INTERACTION_ID,
    icon: (
      <span className="tabular-nums" style={READOUT_STYLE}>
        {label}
      </span>
    ),
    tooltip: "Wasserstand einstellen",
  },
];

export type UseFloodLayerRowOptions = {
  /** whether the host currently shows the row */
  hasRow: boolean;
  /**
   * Whether this route mounts the addon that draws the water. A row that
   * outlived its route has nothing behind it and is dropped.
   */
  hasEngine: boolean;
  /** whether the host is showing the slider panel */
  panelOpen: boolean;
  onAdd: (layer: Layer) => void;
  onRemove: (id: string) => void;
  /** the host keeps a snapshot, so a changed row has to be handed over again */
  onUpdate?: (layer: Layer) => void;
};

/**
 * Keeps the row and the flood in step. The row belongs to the host: the addon
 * only says when it should appear and what it contains, so no store reaches
 * into this library.
 */
export const useFloodLayerRow = ({
  hasRow,
  hasEngine,
  panelOpen,
  onAdd,
  onRemove,
  onUpdate,
}: UseFloodLayerRowOptions) => {
  const { isOn, setOn, title, label, setPanelOpen } = useFloodActions();

  // the app owns the panel state; the row's icon colour reads it from here
  useEffect(() => {
    setPanelOpen(panelOpen);
  }, [panelOpen, setPanelOpen]);

  const layer = useMemo(
    () => ({
      ...FLOOD_LAYER,
      title,
      iconColor: panelOpen ? FLOOD_ICON_COLOR.open : FLOOD_ICON_COLOR.closed,
      interactionButtons: buildInteractionButtons(label),
    }),
    [title, label, panelOpen]
  );

  const layerRef = useRef(layer);
  layerRef.current = layer;

  const onAddRef = useRef(onAdd);
  onAddRef.current = onAdd;
  const onRemoveRef = useRef(onRemove);
  onRemoveRef.current = onRemove;
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  // the row carries the level, so it goes stale on every slider move
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

    // No engine on this route: nothing can draw the water, so the row goes
    // instead of offering a control with nothing behind it.
    if (!hasEngine) {
      if (hasRow) {
        if (!warnedRef.current) {
          warnedRef.current = true;
          console.warn(
            '[ADDON STATE] a flood row reached a route that mounts no "floodSimulation" ' +
              "addon; dropping the row. A route that offers the flood has to declare the addon."
          );
        }
        requestedRef.current = null;
        onRemoveRef.current(FLOOD_LAYER_ID);
      }
      return;
    }

    // removed via the row's ✕ while the flood is still on the map
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

    // The flood restores itself from storage alongside the row, so a row that
    // came back from the host's persistence normally finds `isOn` true. Only a
    // row whose stored flood says off ends up here, and that one is stale.
    if (!isOn && requestedRef.current !== "remove") {
      requestedRef.current = "remove";
      onRemoveRef.current(FLOOD_LAYER_ID);
    }
  }, [hasEngine, hasRow, isOn, setOn]);
};
