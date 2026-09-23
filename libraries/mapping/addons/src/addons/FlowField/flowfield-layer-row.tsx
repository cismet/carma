import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSliders } from "@fortawesome/free-solid-svg-icons";

import type { InteractionButton, Layer } from "@carma-mapping/layers";

import { useIsAdminMode } from "../../lib/admin-mode";
import { getToolEntryKind } from "../../lib/tool-entry";
import {
  useFlowFieldActions,
  type FlowFieldDefinition,
} from "./flowfield-actions";

export const FLOW_FIELD_LAYER_ID = "__flowField__";

/** the readout the row shows instead of opening anything */
export const FLOW_FIELD_STATUS_ID = "flow-field-status";

/**
 * The tuning panel the row opens under `?ff=admin`. Without the flag the
 * button is not on the row at all, so nothing about it is reachable by
 * clicking around.
 */
export const FLOW_FIELD_TUNING_INTERACTION_ID = "flow-field-tuning";

const ICON_COLOR = { running: "#1677ff", idle: "#8c8c8c" };

/** pulls the readout away from the title and towards the buttons */
const READOUT_STYLE: CSSProperties = {
  marginLeft: "6px",
  paddingLeft: "8px",
  borderLeft: "1px solid rgb(0 0 0 / 0.12)",
  fontSize: "11px",
};

/**
 * The row the layer bar shows while the animation is on the map. Same shape as
 * the time series' row, so a route's tools read as one family.
 *
 * It has no ribbon and no play control. The animation has no position to scrub
 * and nothing to pause towards, so the row's whole job is to say the animation
 * is on, say why it is not moving when it is not, and switch it off.
 */
export const FLOW_FIELD_LAYER: Layer = {
  id: FLOW_FIELD_LAYER_ID,
  title: "Fließwege",
  type: "object",
  icon: "flowField",
  iconColor: ICON_COLOR.running,
  visible: true,
  pinned: "last",
  skipSelection: true,
};

/**
 * What the readout says.
 *
 * The zoom gate is the one thing a visitor has to be told about: below it the
 * row is there, the layer is mounted, and nothing moves, which without a word
 * reads as broken rather than as deliberate.
 */
const statusLabel = ({
  isCaged,
  isActive,
  isLoading,
  hasFallback,
}: {
  isCaged: boolean;
  isActive: boolean;
  isLoading: boolean;
  /** a WMS stands in for the animation while cage is absent */
  hasFallback: boolean;
}): string => {
  if (!isCaged) return hasFallback ? "Richtungspfeile" : "nicht verfügbar";
  if (!isActive) return "näher heranzoomen";
  if (isLoading) return "lädt";
  return "läuft";
};

const buildInteractionButtons = (
  label: string,
  isAdmin: boolean
): InteractionButton[] => [
  {
    id: FLOW_FIELD_STATUS_ID,
    icon: <span style={READOUT_STYLE}>{label}</span>,
    tooltip: "Zustand der Fließwege-Animation",
  },
  ...(isAdmin
    ? [
        {
          id: FLOW_FIELD_TUNING_INTERACTION_ID,
          icon: <FontAwesomeIcon icon={faSliders} />,
          tooltip: "Partikel-Parameter",
        },
      ]
    : []),
];

/**
 * The scenario a row carries in its `flowField` tool entry, if it is complete
 * enough to launch. A route with the layer buttons never reads it back: there
 * the animation comes back after a reload through its own store
 * (`flowfield-storage.ts`). It is for a host that only renders the stacks it is
 * handed, like the outlet showing a pm-show scene, where the row is all that
 * arrives of the animation.
 */
export const getFlowFieldRowSeed = (
  layer?: { tools?: unknown } | null
): FlowFieldDefinition | undefined => {
  const tools = Array.isArray(layer?.tools) ? (layer.tools as unknown[]) : [];
  const entry = tools.find(
    (tool): tool is { config?: Partial<FlowFieldDefinition> } =>
      typeof tool === "object" &&
      tool !== null &&
      getToolEntryKind(tool) === "flowField"
  );
  const config = entry?.config;
  if (!config?.service || !config.scenario) return undefined;
  return {
    ...config,
    title: config.title ?? FLOW_FIELD_LAYER.title,
    service: config.service,
    scenario: config.scenario,
  };
};

export type UseFlowFieldLayerRowOptions = {
  /** whether the host currently shows the row */
  hasRow: boolean;
  /**
   * Whether this route mounts the addon that draws the animation. A row that
   * outlived its route has nothing behind it and is dropped.
   */
  hasEngine: boolean;
  /**
   * Whether the host has the animation hidden. The host owns the choice, e.g.
   * as the eye of the layer that launched it; this mirrors it into the
   * channel, where the engine reads it, and reports it back as the row's
   * `visible`.
   */
  hidden?: boolean;
  onAdd: (layer: Layer) => void;
  onRemove: (id: string) => void;
  /** the host keeps a snapshot, so a changed row has to be handed over again */
  onUpdate?: (layer: Layer) => void;
};

/**
 * Keeps the row and the animation in step. The row belongs to the host: the
 * addon only says when it should appear and what it contains, so no store
 * reaches into this library.
 */
export const useFlowFieldLayerRow = ({
  hasRow,
  hasEngine,
  hidden,
  onAdd,
  onRemove,
  onUpdate,
}: UseFlowFieldLayerRowOptions) => {
  const {
    isOn,
    setOn,
    title,
    service,
    scenario,
    layerPostfix,
    uvCorrection,
    minZoom,
    animateWhileMoving,
    opacity,
    viewportBuffer,
    debounceMs,
    occlusion,
    maxFps,
    params,
    backdrop,
    fallback,
    permanent,
    isHidden,
    setHidden,
    isCaged,
    isActive,
    isLoading,
  } = useFlowFieldActions();
  const isAdmin = useIsAdminMode();

  // the host's choice reaches the engine through the channel, the same way
  // everything else about the animation does
  useEffect(() => {
    if (hidden !== undefined && hidden !== isHidden) {
      setHidden(hidden);
    }
  }, [hidden, isHidden, setHidden]);

  const label = statusLabel({
    isCaged,
    isActive,
    isLoading,
    hasFallback: Boolean(fallback),
  });

  // The row's launch config, in the encoding a workflow card uses. Tuning in
  // the panel lands here too, so a scene saved from this stack takes the tuned
  // animation along.
  const tools = useMemo(
    () =>
      service && scenario
        ? [
            {
              kind: "flowField",
              config: {
                title,
                service,
                scenario,
                layerPostfix,
                uvCorrection,
                minZoom,
                animateWhileMoving,
                opacity,
                viewportBuffer,
                debounceMs,
                occlusion,
                maxFps,
                params,
                backdrop: backdrop ?? undefined,
                fallback: fallback ?? undefined,
              } satisfies FlowFieldDefinition,
            },
          ]
        : undefined,
    [
      title,
      service,
      scenario,
      layerPostfix,
      uvCorrection,
      minZoom,
      animateWhileMoving,
      opacity,
      viewportBuffer,
      debounceMs,
      occlusion,
      maxFps,
      params,
      backdrop,
      fallback,
    ]
  );

  const layer = useMemo(
    () => ({
      ...FLOW_FIELD_LAYER,
      title,
      // A launched animation belongs to its layer: the host puts these
      // controls on that layer's button and shows no row of its own.
      permanent,
      pinned: permanent ? ("first" as const) : FLOW_FIELD_LAYER.pinned,
      visible: !isHidden,
      // the blue says "switched on and running"; the layer that launched a
      // permanent one is simply there, so its icon reports no state
      iconColor: permanent
        ? undefined
        : isActive && isCaged
        ? ICON_COLOR.running
        : ICON_COLOR.idle,
      interactionButtons: buildInteractionButtons(label, isAdmin),
      tools,
    }),
    [title, permanent, isHidden, label, isActive, isCaged, isAdmin, tools]
  );

  const layerRef = useRef(layer);
  layerRef.current = layer;

  const onAddRef = useRef(onAdd);
  onAddRef.current = onAdd;
  const onRemoveRef = useRef(onRemove);
  onRemoveRef.current = onRemove;
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  // the readout changes as the map crosses the zoom gate, so the row goes stale
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

    // No engine on this route: nothing can draw the animation, so the row goes
    // instead of offering a control with nothing behind it.
    if (!hasEngine) {
      if (hasRow) {
        if (!warnedRef.current) {
          warnedRef.current = true;
          console.warn(
            '[ADDON STATE] a flow-field row reached a route that mounts no "flowField" ' +
              "addon; dropping the row. A route that offers the animation has to declare the addon."
          );
        }
        requestedRef.current = null;
        onRemoveRef.current(FLOW_FIELD_LAYER_ID);
      }
      return;
    }

    // removed via the row's ✕ while the animation is still on the map
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
      onAddRef.current(layerRef.current);
      return;
    }

    if (!isOn && requestedRef.current !== "remove") {
      requestedRef.current = "remove";
      onRemoveRef.current(FLOW_FIELD_LAYER_ID);
    }
  }, [hasEngine, hasRow, isOn, setOn]);
};
