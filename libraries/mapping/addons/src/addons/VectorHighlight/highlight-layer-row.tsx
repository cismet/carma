import { useEffect, useMemo, useRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import type { InteractionButton, Layer } from "@carma-mapping/layers";

import { useHighlightModeActions } from "./highlight-actions";
import {
  OPERATION_ICONS,
  OPERATION_LABELS,
  type HighlightOperation,
} from "./operations";

export const HIGHLIGHT_LAYER_ID = "__highlight__";

/** the panel the row click opens; deliberately none of the operation buttons,
 *  whose host-side "active" styling would override their own colour */
export const HIGHLIGHT_TOOLS_INTERACTION_ID = "highlight-tools";

export const HIGHLIGHT_ADD_BUTTON_ID = "highlight-add";
export const HIGHLIGHT_SUBTRACT_BUTTON_ID = "highlight-subtract";
export const HIGHLIGHT_INVERT_BUTTON_ID = "highlight-invert";
export const HIGHLIGHT_INTERSECT_BUTTON_ID = "highlight-intersect";

const OPERATION_BUTTON_IDS: Record<HighlightOperation, string> = {
  add: HIGHLIGHT_ADD_BUTTON_ID,
  subtract: HIGHLIGHT_SUBTRACT_BUTTON_ID,
  invert: HIGHLIGHT_INVERT_BUTTON_ID,
  intersect: HIGHLIGHT_INTERSECT_BUTTON_ID,
};

const WIRED_OPERATIONS: HighlightOperation[] = [
  "add",
  "subtract",
  "invert",
  "intersect",
];

const buildInteractionButtons = (
  setOperation: (operation: HighlightOperation) => void,
  activeOperation: HighlightOperation,
  colorForOperation: (operation: HighlightOperation) => string
): InteractionButton[] =>
  (Object.keys(OPERATION_BUTTON_IDS) as HighlightOperation[]).map(
    (operation) => {
      const wired = WIRED_OPERATIONS.includes(operation);
      const isActive = wired && operation === activeOperation;
      return {
        id: OPERATION_BUTTON_IDS[operation],
        icon: (
          <FontAwesomeIcon
            icon={OPERATION_ICONS[operation]}
            style={
              isActive ? { color: colorForOperation(operation) } : undefined
            }
          />
        ),
        tooltip: OPERATION_LABELS[operation],
        onClick: wired ? () => setOperation(operation) : undefined,
      };
    }
  );

export const HIGHLIGHT_LAYER: Layer = {
  id: HIGHLIGHT_LAYER_ID,
  title: "Auswahl",
  type: "object",
  icon: "highlight",
  iconColor: "#6b7280",
  iconSize: "0.75rem",
  visible: true,
  pinned: "last",
  skipSelection: true,
  rowClickInteractionId: HIGHLIGHT_TOOLS_INTERACTION_ID,
};

export type UseHighlightLayerRowOptions = {
  /** whether the host already shows the row */
  hasRow: boolean;
  onAdd: (layer: Layer) => void;
  onRemove: (id: string) => void;
  /** the host keeps a snapshot, so a changed row has to be handed over again */
  onUpdate?: (layer: Layer) => void;
};

/**
 * Layer-bar row for the highlight mode. The row itself is owned by the host —
 * the addon only says when it should appear and what it contains, so no store
 * reaches into the library.
 */
export const useHighlightLayerRow = ({
  hasRow,
  onAdd,
  onRemove,
  onUpdate,
}: UseHighlightLayerRowOptions) => {
  const { isOn, endMode, operation, setOperation, colorForOperation } =
    useHighlightModeActions();

  // the host stores a snapshot of the layer, so the handlers have to travel
  // with it rather than being read from here later
  const layer = useMemo(
    () => ({
      ...HIGHLIGHT_LAYER,
      interactionButtons: buildInteractionButtons(
        setOperation,
        operation,
        colorForOperation
      ),
    }),
    [setOperation, operation, colorForOperation]
  );
  const layerRef = useRef(layer);
  layerRef.current = layer;

  const onAddRef = useRef(onAdd);
  onAddRef.current = onAdd;
  const onRemoveRef = useRef(onRemove);
  onRemoveRef.current = onRemove;
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  // the buttons carry the active operation, so the row on screen goes stale
  // whenever it changes
  useEffect(() => {
    if (hasRow) {
      onUpdateRef.current?.(layer);
    }
  }, [hasRow, layer]);

  const prevRef = useRef({ isOn, hasRow });
  /** what we last asked the host for, so a re-render before the host's state
   *  catches up does not send the same request twice */
  const requestedRef = useRef<"add" | "remove" | null>(null);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = { isOn, hasRow };

    // removed via the row's ✕ while the mode is still running
    if (isOn && !hasRow && prev.hasRow) {
      requestedRef.current = null;
      endMode();
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

    // also catches a row restored from a persisted session: the mode itself is
    // never persisted, so a row without a running mode is always stale
    if (!isOn && requestedRef.current !== "remove") {
      requestedRef.current = "remove";
      onRemoveRef.current(HIGHLIGHT_LAYER_ID);
    }
  }, [endMode, hasRow, isOn]);
};
