import { useEffect, useRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSliders } from "@fortawesome/free-solid-svg-icons";

import type { InteractionButton, Layer } from "@carma-mapping/layers";

import { useComparingActions } from "./comparing-actions";

export const COMPARING_LAYER_ID = "__comparing__";

/** the pane the row's button opens, registered by the host */
export const COMPARING_TOOLS_INTERACTION_ID = "comparing-tools";

const interactionButtons: InteractionButton[] = [
  {
    id: COMPARING_TOOLS_INTERACTION_ID,
    icon: <FontAwesomeIcon icon={faSliders} />,
    tooltip: "Vergleich einstellen",
  },
];

/**
 * The layer-bar row for the comparison, the way measurement mode has one: it
 * exists exactly while the mode runs, and closing it leaves the mode.
 *
 * Its one button opens the control pane. The host decides what that button id
 * resolves to, so the addon can bring a pane without the app knowing what is
 * in it.
 */
export const COMPARING_LAYER: Layer = {
  id: COMPARING_LAYER_ID,
  title: "Vergleich",
  type: "object",
  icon: "comparing",
  visible: true,
  pinned: "last",
  skipSelection: true,
  interactionButtons,
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

    // also catches a row restored from a persisted session whose comparison did
    // not come back with it: the row and the mode are kept in two different
    // stores, so either can outlive the other, and the row is the one to drop
    if (!isOn && requestedRef.current !== "remove") {
      requestedRef.current = "remove";
      onRemoveRef.current(COMPARING_LAYER_ID);
    }
  }, [hasRow, isOn, setOn]);
};
