import { useEffect, useRef } from "react";

import type { Layer } from "@carma-mapping/layers";

import { useComparingActions } from "./comparing-actions";

export const COMPARING_LAYER_ID = "__comparing__";

/**
 * The layer-bar row for the comparison, the way measurement mode has one: it
 * exists exactly while the mode runs, and closing it leaves the mode.
 *
 * Only a marker for now. The mode picker and the role table that the row will
 * open are not built yet, so the row carries no interaction buttons.
 */
export const COMPARING_LAYER: Layer = {
  id: COMPARING_LAYER_ID,
  title: "Vergleich",
  type: "object",
  icon: "comparing",
  visible: true,
  pinned: "last",
  skipSelection: true,
};

export type UseComparingLayerRowOptions = {
  /** whether the host already shows the row */
  hasRow: boolean;
  onAdd: (layer: Layer) => void;
  onRemove: (id: string) => void;
};

/**
 * Keeps the row and the mode in step. The row itself belongs to the host: the
 * addon only says when it should appear and what it contains, so no store
 * reaches into the library.
 */
export const useComparingLayerRow = ({
  hasRow,
  onAdd,
  onRemove,
}: UseComparingLayerRowOptions) => {
  const { isOn, setOn } = useComparingActions();

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
      setOn(false);
      return;
    }

    if (isOn === hasRow) {
      requestedRef.current = null;
      return;
    }

    if (isOn && requestedRef.current !== "add") {
      requestedRef.current = "add";
      onAddRef.current(COMPARING_LAYER);
      return;
    }

    // also catches a row restored from a persisted session: the mode itself is
    // never persisted, so a row without a running mode is always stale
    if (!isOn && requestedRef.current !== "remove") {
      requestedRef.current = "remove";
      onRemoveRef.current(COMPARING_LAYER_ID);
    }
  }, [hasRow, isOn, setOn]);
};
