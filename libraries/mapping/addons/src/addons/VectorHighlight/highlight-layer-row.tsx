import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import type { DrawShape } from "@carma-mapping/engines/maplibre";
import type { InteractionButton, Layer } from "@carma-mapping/layers";

import { useHighlightModeActions } from "./highlight-actions";
import {
  OPERATION_ICONS,
  OPERATION_LABELS,
  type HighlightOperation,
} from "./operations";
import { SHAPE_ICONS, SHAPE_LABELS } from "./shapes";

export const HIGHLIGHT_LAYER_ID = "__highlight__";

/** the panel the row click opens; deliberately none of the toggle buttons,
 *  whose host-side "active" styling would override their own colour */
export const HIGHLIGHT_TOOLS_INTERACTION_ID = "highlight-tools";

export const HIGHLIGHT_OPERATIONS_TOGGLE_ID = "highlight-operations-toggle";
export const HIGHLIGHT_SHAPES_TOGGLE_ID = "highlight-shapes-toggle";

/** pulls the toggles closer than the pill's own gap + padding would */
const BUTTON_SPACING: CSSProperties = { margin: "0 -2px" };

/** room between the title and the toggles */
const GROUP_GAP_START = "6px";
/** room between the toggles and the close button */
const GROUP_GAP_END = "-2px";

type ToggleOptions = {
  operation: HighlightOperation;
  shape: DrawShape;
  showOperations: boolean;
  showShapes: boolean;
  toggleOperations: () => void;
  toggleShapes: () => void;
  colorForOperation: (operation: HighlightOperation) => string;
};

/** two buttons, each showing what its section currently has selected */
const buildInteractionButtons = ({
  operation,
  shape,
  showOperations,
  showShapes,
  toggleOperations,
  toggleShapes,
  colorForOperation,
}: ToggleOptions): InteractionButton[] => {
  const activeColor = colorForOperation(operation);
  return [
    {
      id: HIGHLIGHT_OPERATIONS_TOGGLE_ID,
      icon: (
        <span style={{ ...BUTTON_SPACING, marginLeft: GROUP_GAP_START }}>
          <FontAwesomeIcon
            icon={OPERATION_ICONS[operation]}
            style={showOperations ? { color: activeColor } : undefined}
          />
        </span>
      ),
      tooltip: `${OPERATION_LABELS[operation]} – Operationen ${
        showOperations ? "ausblenden" : "einblenden"
      }`,
      onClick: toggleOperations,
    },
    {
      id: HIGHLIGHT_SHAPES_TOGGLE_ID,
      icon: (
        <span style={{ ...BUTTON_SPACING, marginRight: GROUP_GAP_END }}>
          <FontAwesomeIcon
            icon={SHAPE_ICONS[shape]}
            style={showShapes ? { color: activeColor } : undefined}
          />
        </span>
      ),
      tooltip: `${SHAPE_LABELS[shape]} – Formen ${
        showShapes ? "ausblenden" : "einblenden"
      }`,
      onClick: toggleShapes,
    },
  ];
};

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
  /** a section was switched back on and needs the panel open to be seen */
  onOpenPanel?: (layer: Layer) => void;
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
  onOpenPanel,
}: UseHighlightLayerRowOptions) => {
  const {
    isOn,
    endMode,
    operation,
    shape,
    colorForOperation,
    showOperations,
    showShapes,
    toggleOperations,
    toggleShapes,
  } = useHighlightModeActions();

  // the host stores a snapshot of the layer, so the handlers have to travel
  // with it rather than being read from here later
  const layer = useMemo(
    () => ({
      ...HIGHLIGHT_LAYER,
      interactionButtons: buildInteractionButtons({
        operation,
        shape,
        showOperations,
        showShapes,
        toggleOperations,
        toggleShapes,
        colorForOperation,
      }),
    }),
    [
      operation,
      shape,
      showOperations,
      showShapes,
      toggleOperations,
      toggleShapes,
      colorForOperation,
    ]
  );
  const layerRef = useRef(layer);
  layerRef.current = layer;

  const onAddRef = useRef(onAdd);
  onAddRef.current = onAdd;
  const onRemoveRef = useRef(onRemove);
  onRemoveRef.current = onRemove;
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;
  const onOpenPanelRef = useRef(onOpenPanel);
  onOpenPanelRef.current = onOpenPanel;

  // the toggles only flip the section flags; the panel itself may be closed, so
  // switching a section back on has to bring it up again
  const previousSections = useRef({ showOperations, showShapes });
  useEffect(() => {
    const previous = previousSections.current;
    previousSections.current = { showOperations, showShapes };
    const opened =
      (showOperations && !previous.showOperations) ||
      (showShapes && !previous.showShapes);
    if (opened && hasRow) {
      onOpenPanelRef.current?.(layerRef.current);
    }
  }, [hasRow, showOperations, showShapes]);

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
