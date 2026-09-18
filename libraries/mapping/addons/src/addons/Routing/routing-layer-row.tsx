import { useEffect, useMemo, useRef, type CSSProperties } from "react";

import type { InteractionButton, Layer } from "@carma-mapping/layers";
import { formatDistance, formatRouteSummary } from "@carma-mapping/routing";

import { useLocationSimulation } from "../LocationSimulator/simulationChannel";
import { REMAINING_PREFIX } from "./config";
import { useRouteNavigation } from "./routeChannel";

export const ROUTING_LAYER_ID = "__routing__";

/** the ribbon the row opens, registered by the host */
export const ROUTING_TOOLS_INTERACTION_ID = "routing-tools";

/** blue while the ribbon is open, black while it is not */
export const ROUTING_ICON_COLOR = { open: "#1677ff", closed: "#000000" };

/** pulls the readout away from the title and towards the buttons */
const READOUT_STYLE: CSSProperties = {
  marginLeft: "6px",
  paddingLeft: "8px",
  borderLeft: "1px solid rgb(0 0 0 / 0.12)",
};

/**
 * The row the layer bar shows while a navigation runs: the title and what is
 * left of the route, which opens the ribbon while there is one to open. Same
 * shape as the flood's and the time series' rows, so a route's tools read as
 * one family.
 *
 * No `tools`: the navigation is not persisted, so the host's rehydrate filter
 * drops the row with the session, and a row that somehow comes back without
 * a running navigation is removed below.
 */
export const ROUTING_LAYER: Layer = {
  id: ROUTING_LAYER_ID,
  title: "Navigation",
  type: "object",
  icon: "routing",
  iconColor: ROUTING_ICON_COLOR.closed,
  visible: true,
  pinned: "last",
  skipSelection: true,
};

/**
 * The countdown at the row's end. With a ribbon behind it (the simulator's
 * slider), it carries the ribbon's id: the readout is lit while the ribbon is
 * open and clicking it closes the ribbon again. Without one it is a readout
 * and nothing more; the no-op keeps the host from opening a panel there is
 * nothing to show in.
 */
const buildInteractionButtons = (
  label: string,
  hasRibbon: boolean
): InteractionButton[] => [
  {
    id: ROUTING_TOOLS_INTERACTION_ID,
    icon: (
      <span className="tabular-nums" style={READOUT_STYLE}>
        {label}
      </span>
    ),
    ...(hasRibbon
      ? { tooltip: "Navigation einstellen" }
      : {
          onClick: () => {
            /* a readout, not a switch */
          },
        }),
  },
];

export type UseRoutingLayerRowOptions = {
  /** whether the host currently shows the row */
  hasRow: boolean;
  /**
   * Whether this route mounts the routing addon. A row that outlived its
   * route has nothing behind it and is dropped.
   */
  hasEngine: boolean;
  /** whether the host is showing the ribbon; the row's icon is blue then */
  panelOpen: boolean;
  onAdd: (layer: Layer) => void;
  onRemove: (id: string) => void;
  /** the host keeps a snapshot, so a changed row has to be handed over again */
  onUpdate?: (layer: Layer) => void;
};

/**
 * Keeps the row and the navigation in step. The row belongs to the host: the
 * addon only says when it should appear and what it contains, so no store
 * reaches into this library. The navigation itself is the `routing` addon's,
 * read off its `routeNavigation` channel; the row's ✕ ends it.
 */
export const useRoutingLayerRow = ({
  hasRow,
  hasEngine,
  panelOpen,
  onAdd,
  onRemove,
  onUpdate,
}: UseRoutingLayerRowOptions) => {
  const navigation = useRouteNavigation();
  const isOn = navigation?.navigating ?? false;
  const progress = navigation?.progress ?? null;
  const stop = navigation?.stop;
  // the ribbon only holds the simulator's controls; a real device cannot be
  // moved, so without the simulator the row opens nothing
  const hasRibbon = useLocationSimulation() !== null;

  // the same words the info box note says, so the two never disagree; a
  // route that was only measured carries no minutes and gets the meters alone
  const label = progress
    ? `${REMAINING_PREFIX} ${
        progress.remainingSeconds !== undefined
          ? formatRouteSummary(
              progress.remainingSeconds,
              progress.remainingMeters
            )
          : formatDistance(progress.remainingMeters)
      }`
    : "…";

  const layer = useMemo(
    () => ({
      ...ROUTING_LAYER,
      iconColor: panelOpen
        ? ROUTING_ICON_COLOR.open
        : ROUTING_ICON_COLOR.closed,
      ...(hasRibbon
        ? { rowClickInteractionId: ROUTING_TOOLS_INTERACTION_ID }
        : {}),
      interactionButtons: buildInteractionButtons(label, hasRibbon),
    }),
    [label, panelOpen, hasRibbon]
  );

  const layerRef = useRef(layer);
  layerRef.current = layer;

  const onAddRef = useRef(onAdd);
  onAddRef.current = onAdd;
  const onRemoveRef = useRef(onRemove);
  onRemoveRef.current = onRemove;
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;
  const stopRef = useRef(stop);
  stopRef.current = stop;

  // the row carries the countdown, so it goes stale on every fix
  useEffect(() => {
    if (hasEngine && hasRow) {
      onUpdateRef.current?.(layer);
    }
  }, [hasEngine, hasRow, layer]);

  const prevRef = useRef({ isOn, hasRow });
  /** what we last asked the host for, so a re-render before the host's state
   *  catches up does not send the same request twice */
  const requestedRef = useRef<"add" | "remove" | null>(null);
  /** the warning is about the route's configuration, so once is enough */
  const warnedRef = useRef(false);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = { isOn, hasRow };

    // No engine on this route: nothing navigates, so the row goes instead of
    // offering a control with nothing behind it.
    if (!hasEngine) {
      if (hasRow) {
        if (!warnedRef.current) {
          warnedRef.current = true;
          console.warn(
            '[ADDON STATE] a navigation row reached a route that mounts no "routing" ' +
              "addon; dropping the row. A route that offers the navigation has to declare the addon."
          );
        }
        requestedRef.current = null;
        onRemoveRef.current(ROUTING_LAYER_ID);
      }
      return;
    }

    // removed via the row's ✕ while the navigation still runs
    if (isOn && !hasRow && prev.hasRow) {
      requestedRef.current = null;
      stopRef.current?.();
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

    // a row without a running navigation behind it is stale
    if (!isOn && requestedRef.current !== "remove") {
      requestedRef.current = "remove";
      onRemoveRef.current(ROUTING_LAYER_ID);
    }
  }, [hasEngine, hasRow, isOn]);
};
