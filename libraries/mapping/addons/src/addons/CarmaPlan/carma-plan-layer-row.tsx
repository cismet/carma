import { useEffect, useMemo, useRef, type CSSProperties } from "react";

import type { InteractionButton, Layer } from "@carma-mapping/layers";

import {
  carmaPlanChoiceLabel,
  useCarmaPlanActions,
} from "./carma-plan-actions";

export const CARMA_PLAN_LAYER_ID = "__carmaPlan__";

/** the panel the row opens, registered by the host */
export const CARMA_PLAN_TOOLS_INTERACTION_ID = "carma-plan-tools";

/** blue while the panel is open, black while it is not */
export const CARMA_PLAN_ICON_COLOR = { open: "#1677ff", closed: "#000000" };

/** pulls the readout away from the title and towards the buttons */
const READOUT_STYLE: CSSProperties = {
  marginLeft: "6px",
  paddingLeft: "8px",
  borderLeft: "1px solid rgb(0 0 0 / 0.12)",
};

/**
 * The row the layer bar shows while the plan is on: the site and what it
 * shows, which opens the scenario picker. Same shape as the flood's row.
 */
export const CARMA_PLAN_LAYER: Layer = {
  id: CARMA_PLAN_LAYER_ID,
  title: "Planung",
  type: "object",
  icon: "carmaPlan",
  iconColor: CARMA_PLAN_ICON_COLOR.closed,
  visible: true,
  pinned: "last",
  skipSelection: true,
  rowClickInteractionId: CARMA_PLAN_TOOLS_INTERACTION_ID,
};

const buildInteractionButtons = (label: string): InteractionButton[] => [
  {
    // same id as `rowClickInteractionId`, so the readout is lit while the
    // panel is open and clicking it closes the panel again
    id: CARMA_PLAN_TOOLS_INTERACTION_ID,
    icon: <span style={READOUT_STYLE}>{label}</span>,
    tooltip: "Szenario wählen",
  },
];

export type UseCarmaPlanLayerRowOptions = {
  /** whether the host currently shows the row */
  hasRow: boolean;
  /** whether this route mounts the addon; a row without it is dropped */
  hasEngine: boolean;
  /** whether the host is showing the panel */
  panelOpen: boolean;
  onAdd: (layer: Layer) => void;
  onRemove: (id: string) => void;
  /** the host keeps a snapshot, so a changed row has to be handed over again */
  onUpdate?: (layer: Layer) => void;
};

/**
 * Keeps the row and the plan in step. The row belongs to the host: the addon
 * only says when it should appear and what it contains.
 */
export const useCarmaPlanLayerRow = ({
  hasRow,
  hasEngine,
  panelOpen,
  onAdd,
  onRemove,
  onUpdate,
}: UseCarmaPlanLayerRowOptions) => {
  const { isOn, setOn, scenario, siteTitle, setPanelOpen } =
    useCarmaPlanActions();

  useEffect(() => {
    setPanelOpen(panelOpen);
  }, [panelOpen, setPanelOpen]);

  const layer = useMemo(
    () => ({
      ...CARMA_PLAN_LAYER,
      title: siteTitle ? `Planung ${siteTitle}` : CARMA_PLAN_LAYER.title,
      iconColor: panelOpen
        ? CARMA_PLAN_ICON_COLOR.open
        : CARMA_PLAN_ICON_COLOR.closed,
      interactionButtons: buildInteractionButtons(
        carmaPlanChoiceLabel(scenario)
      ),
    }),
    [siteTitle, scenario, panelOpen]
  );
  const layerRef = useRef(layer);
  layerRef.current = layer;

  const onAddRef = useRef(onAdd);
  onAddRef.current = onAdd;
  const onRemoveRef = useRef(onRemove);
  onRemoveRef.current = onRemove;
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    if (hasEngine && hasRow) onUpdateRef.current?.(layer);
  }, [hasEngine, hasRow, layer]);

  const prevRef = useRef({ isOn, hasRow });
  /** what we last asked the host for, so a re-render before the host's state
   *  catches up does not send the same request twice */
  const requestedRef = useRef<"add" | "remove" | null>(null);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = { isOn, hasRow };

    if (!hasEngine) {
      if (hasRow) {
        requestedRef.current = null;
        onRemoveRef.current(CARMA_PLAN_LAYER_ID);
      }
      return;
    }

    // removed via the row's ✕ while the plan is still on
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

    // the plan is session-only, so a row restored from the host's storage
    // finds it off and is stale
    if (!isOn && requestedRef.current !== "remove") {
      requestedRef.current = "remove";
      onRemoveRef.current(CARMA_PLAN_LAYER_ID);
    }
  }, [hasEngine, hasRow, isOn, setOn]);
};
