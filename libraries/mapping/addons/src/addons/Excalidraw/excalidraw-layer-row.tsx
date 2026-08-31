import { useEffect, useRef } from "react";

import type { Layer } from "@carma-mapping/layers";

import { useExcalidrawActions } from "./excalidraw-actions";

export const EXCALIDRAW_LAYER_ID = "__excalidraw__";

export const EXCALIDRAW_TOOLS_INTERACTION_ID = "excalidraw-tools";

export const EXCALIDRAW_LAYER: Layer = {
  id: EXCALIDRAW_LAYER_ID,
  title: "Zeichnen",
  type: "object",
  icon: "drawing",
  iconColor: "#6b7280",
  iconSize: "0.75rem",
  visible: true,
  pinned: "last",
  skipSelection: true,
  rowClickInteractionId: EXCALIDRAW_TOOLS_INTERACTION_ID,
};

export type UseExcalidrawLayerRowOptions = {
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
export const useExcalidrawLayerRow = ({
  hasRow,
  onAdd,
  onRemove,
}: UseExcalidrawLayerRowOptions) => {
  const { isOn, endMode } = useExcalidrawActions();

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
      onAddRef.current(EXCALIDRAW_LAYER);
      return;
    }

    if (!isOn && requestedRef.current !== "remove") {
      requestedRef.current = "remove";
      onRemoveRef.current(EXCALIDRAW_LAYER_ID);
    }
  }, [endMode, hasRow, isOn]);
};
