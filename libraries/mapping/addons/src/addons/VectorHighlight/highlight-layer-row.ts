import { useEffect, useRef } from "react";

import type { InteractionButton, Layer } from "@carma-mapping/layers";

import { useHighlightModeActions } from "./highlight-actions";

export const HIGHLIGHT_LAYER_ID = "__highlight__";

export const HIGHLIGHT_INVERT_BUTTON_ID = "highlight-invert";
export const HIGHLIGHT_INTERSECT_BUTTON_ID = "highlight-intersect";

const INTERACTION_BUTTONS: InteractionButton[] = [
  { id: HIGHLIGHT_INVERT_BUTTON_ID, icon: "Invertieren" },
  { id: HIGHLIGHT_INTERSECT_BUTTON_ID, icon: "Schneiden" },
];

export const HIGHLIGHT_LAYER: Layer = {
  id: HIGHLIGHT_LAYER_ID,
  title: "Auswahl",
  type: "object",
  icon: "highlight",
  visible: true,
  pinned: "last",
  skipSelection: true,
  interactionButtons: INTERACTION_BUTTONS,
};

export type UseHighlightLayerRowOptions = {
  /** whether the host already shows the row */
  hasRow: boolean;
  onAdd: (layer: Layer) => void;
  onRemove: (id: string) => void;
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
}: UseHighlightLayerRowOptions) => {
  const { isOn, endMode } = useHighlightModeActions();

  const onAddRef = useRef(onAdd);
  onAddRef.current = onAdd;
  const onRemoveRef = useRef(onRemove);
  onRemoveRef.current = onRemove;

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
      onAddRef.current(HIGHLIGHT_LAYER);
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
