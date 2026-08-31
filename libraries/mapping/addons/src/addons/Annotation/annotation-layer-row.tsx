import { useEffect, useRef } from "react";

import type { Layer } from "@carma-mapping/layers";

import { useAnnotationActions } from "./annotation-actions";

export const ANNOTATION_LAYER_ID = "__annotation__";

export const ANNOTATION_TOOLS_INTERACTION_ID = "annotation-tools";

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
};

/**
 * Layer-bar row for the sketch mode, mirroring `useHighlightLayerRow`: the row
 * is the host's, the addon only says when it should be there. Switching the
 * mode off takes the row and its panel with it, and closing the row with its ✕
 * ends the mode.
 */
export const useAnnotationLayerRow = ({
  hasRow,
  onAdd,
  onRemove,
}: UseAnnotationLayerRowOptions) => {
  const { isOn, endMode } = useAnnotationActions();

  const onAddRef = useRef(onAdd);
  onAddRef.current = onAdd;
  const onRemoveRef = useRef(onRemove);
  onRemoveRef.current = onRemove;

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
      onAddRef.current(ANNOTATION_LAYER);
      return;
    }

    if (!isOn && requestedRef.current !== "remove") {
      requestedRef.current = "remove";
      onRemoveRef.current(ANNOTATION_LAYER_ID);
    }
  }, [endMode, hasRow, isOn]);
};
