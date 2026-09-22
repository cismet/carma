import { useEffect, useRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSliders } from "@fortawesome/free-solid-svg-icons";

import type { InteractionButton, Layer } from "@carma-mapping/layers";

import { useAddonState } from "../../lib/AddonStateContext";
import { useComparingActions } from "./comparing-actions";
import { COMPARING_WORKFLOW_KIND } from "./comparing-workflow";

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
 * The layer-bar row of a comparison that has not been saved as a layer yet,
 * the way measurement mode has one: it exists while the mode runs, closing
 * it leaves the mode, and it carries no definition, so it is neither
 * persisted nor shared. "Als Layer speichern" in its pane turns the running
 * comparison into a workflow group, which then stands in for this row.
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
  /**
   * Whether this route mounts an addon that runs the comparison. A row that
   * arrives on a route without an engine is dropped rather than shown.
   */
  hasEngine: boolean;
  onAdd: (layer: Layer) => void;
  onRemove: (id: string) => void;
};

/** whether a comparing workflow group is the one running the comparison */
const useComparingGroupRuns = (): boolean => {
  const [activity] = useAddonState("workflowActivity");
  return Object.values(activity ?? {}).some(
    (entry) =>
      entry.kind === COMPARING_WORKFLOW_KIND && entry.status === "running"
  );
};

/**
 * Keeps the row and the mode in step. The row itself belongs to the host: the
 * addon only says when it should appear, so no store reaches into the library.
 * While a workflow group runs the comparison the group's button is the row,
 * and this one stays out of the bar.
 */
export const useComparingLayerRow = ({
  hasRow,
  hasEngine,
  onAdd,
  onRemove,
}: UseComparingLayerRowOptions) => {
  const { isOn, setOn } = useComparingActions();
  const groupRuns = useComparingGroupRuns();
  const wantRow = isOn && !groupRuns;

  const onAddRef = useRef(onAdd);
  onAddRef.current = onAdd;
  const onRemoveRef = useRef(onRemove);
  onRemoveRef.current = onRemove;

  const prevRef = useRef({ wantRow, hasRow });
  /** what we last asked the host for, so a re-render before the host's state
   *  catches up does not send the same request twice */
  const requestedRef = useRef<"add" | "remove" | null>(null);
  /** the warning is about the route's configuration, so once is enough */
  const warnedRef = useRef(false);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = { wantRow, hasRow };

    // No engine on this route: nothing can draw the panels, so the row goes
    // instead of offering a control with nothing behind it.
    if (!hasEngine) {
      if (hasRow) {
        if (!warnedRef.current) {
          warnedRef.current = true;
          console.warn(
            "[ADDON STATE] a comparison row reached a route that mounts no " +
              "comparison addon; dropping the row. A route that offers the " +
              "comparison has to declare the addons."
          );
        }
        requestedRef.current = null;
        onRemoveRef.current(COMPARING_LAYER_ID);
      }
      return;
    }

    // removed via the row's ✕ while the mode is still running
    if (wantRow && !hasRow && prev.hasRow && prev.wantRow) {
      requestedRef.current = null;
      setOn(false);
      return;
    }

    if (wantRow === hasRow) {
      requestedRef.current = null;
      return;
    }

    if (wantRow && requestedRef.current !== "add") {
      requestedRef.current = "add";
      onAddRef.current(COMPARING_LAYER);
      return;
    }

    // also catches a row restored from a persisted session whose comparison did
    // not come back with it: the row and the mode are kept in two different
    // stores, so either can outlive the other, and the row is the one to drop
    if (!wantRow && requestedRef.current !== "remove") {
      requestedRef.current = "remove";
      onRemoveRef.current(COMPARING_LAYER_ID);
    }
  }, [hasEngine, hasRow, wantRow, setOn]);
};
