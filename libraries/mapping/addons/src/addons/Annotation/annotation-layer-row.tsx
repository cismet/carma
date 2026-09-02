import { useEffect, useMemo, useRef } from "react";
import { faLock, faLockOpen, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import type { InteractionButton, Layer } from "@carma-mapping/layers";

import { useAnnotationActions } from "./annotation-actions";

export const ANNOTATION_LAYER_ID = "__annotation__";

export const ANNOTATION_TOOLS_INTERACTION_ID = "annotation-tools";

export const ANNOTATION_LOCK_TOGGLE_ID = "annotation-lock-toggle";
export const ANNOTATION_ADD_DRAWING_ID = "annotation-add-drawing";

const ACTIVE_COLOR = "#1677ff";

type RowActions = {
  isLocked: boolean;
  toggleLock: () => void;
  addGroup: () => void;
};

const buildInteractionButtons = ({
  isLocked,
  toggleLock,
  addGroup,
}: RowActions): InteractionButton[] => [
  {
    id: ANNOTATION_LOCK_TOGGLE_ID,
    icon: (
      <FontAwesomeIcon
        icon={isLocked ? faLock : faLockOpen}
        style={isLocked ? { color: ACTIVE_COLOR } : undefined}
      />
    ),
    tooltip: isLocked ? "Zeichnung entsperren" : "Zeichnung sperren",
    onClick: toggleLock,
  },
  {
    id: ANNOTATION_ADD_DRAWING_ID,
    icon: <FontAwesomeIcon icon={faPlus} />,
    tooltip: "Neue Zeichnung beginnen",
    onClick: addGroup,
  },
];

export const ANNOTATION_LAYER: Layer = {
  id: ANNOTATION_LAYER_ID,
  title: "Zeichnen",
  type: "object",
  icon: "drawing",
  iconColor: "#6b7280",
  iconSize: "0.75rem",
  visible: true,
  pinned: "last",
  skipSelection: true,
  rowClickInteractionId: ANNOTATION_TOOLS_INTERACTION_ID,
};

export type UseAnnotationLayerRowOptions = {
  /** whether the host already shows the row */
  hasRow: boolean;
  onAdd: (layer: Layer) => void;
  onRemove: (id: string) => void;
  onUpdate?: (layer: Layer) => void;
};

/**
 * Layer-bar row for the sketch mode, mirroring `useHighlightLayerRow`: the row
 * belongs to the host, the addon only declares when it applies and what it
 * carries. Switching the mode off removes the row and its panel; closing the
 * row with its ✕ ends the mode.
 */
export const useAnnotationLayerRow = ({
  hasRow,
  onAdd,
  onRemove,
  onUpdate,
}: UseAnnotationLayerRowOptions) => {
  const { isOn, isLocked, endMode, toggleLock, addGroup } =
    useAnnotationActions();

  const layer = useMemo<Layer>(
    () => ({
      ...ANNOTATION_LAYER,
      interactionButtons: buildInteractionButtons({
        isLocked,
        toggleLock,
        addGroup,
      }),
    }),
    [addGroup, isLocked, toggleLock]
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
    if (hasRow) {
      onUpdateRef.current?.(layer);
    }
  }, [hasRow, layer]);

  const prevRef = useRef({ isOn, hasRow });
  const requestedRef = useRef<"add" | "remove" | null>(null);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = { isOn, hasRow };

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

    if (!isOn && requestedRef.current !== "remove") {
      requestedRef.current = "remove";
      onRemoveRef.current(ANNOTATION_LAYER_ID);
    }
  }, [endMode, hasRow, isOn]);
};
