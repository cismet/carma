import { useEffect, useRef } from "react";
import { faSliders } from "@fortawesome/free-solid-svg-icons";

import { getStackLayers } from "@carma-mapping/layers";

import type { AddonWorkflowSpec, WorkflowEngineProps } from "../../lib/workflow";
import {
  BUILT_COMPARE_MODES,
  clampPanelCount,
  COMPARE_MODE,
  orientationApplies,
  type CompareMode,
} from "./compare-modes";
import {
  toCompareDefinition,
  useComparingActions,
  type CompareDefinition,
  type CompareState,
} from "./comparing-actions";

/** what the info view calls a mode; the pane's picker uses the same words */
const MODE_LABELS: Record<CompareMode, string> = {
  [COMPARE_MODE.swipe]: "Schieber",
  [COMPARE_MODE.arena]: "Arena",
  [COMPARE_MODE.spyglass]: "Lupe",
};

/** "Schieber, nebeneinander" or "Lupe": the layout in a few words */
const describeLayout = (definition: CompareDefinition): string => {
  const mode = MODE_LABELS[definition.mode];
  if (!orientationApplies(definition.panelCount, definition.mode)) {
    return definition.panelCount === 4 ? `${mode}, Raster` : mode;
  }
  return `${mode}, ${
    definition.orientation === "vertical" ? "übereinander" : "nebeneinander"
  }`;
};

/** the kind a workflow group's tool names; its config is a `CompareDefinition` */
export const COMPARING_WORKFLOW_KIND = "comparing";

/**
 * A definition as a string, for effect dependencies and comparisons: the
 * host hands the engine a fresh object every render, and the effects have to
 * run when the definition changes, not on every render.
 */
const seedKey = (definition: CompareDefinition | undefined): string | undefined =>
  definition === undefined ? undefined : JSON.stringify(definition);

/**
 * The definition a group's tool config carries, if it is complete enough to
 * launch. The config comes back from persisted state or a shared link, so the
 * shape is checked here rather than trusted.
 */
export const seedCompareDefinition = (
  config: unknown
): CompareDefinition | undefined => {
  const launch = config as Partial<CompareDefinition> | undefined;
  if (
    !launch ||
    typeof launch.mode !== "string" ||
    !BUILT_COMPARE_MODES.includes(launch.mode) ||
    typeof launch.panelCount !== "number"
  ) {
    return undefined;
  }
  const mode = launch.mode as CompareMode;
  return {
    mode,
    orientation: launch.orientation === "vertical" ? "vertical" : "horizontal",
    panelCount: clampPanelCount(mode, launch.panelCount),
    ...(launch.assignments ? { assignments: launch.assignments } : {}),
    ...(typeof launch.spyglassRadius === "number"
      ? { spyglassRadius: launch.spyglassRadius }
      : {}),
  };
};

/**
 * Binds one workflow group to the comparison channel.
 *
 * Group to channel: while the group is active, the definition it carries is
 * the comparison that runs; a definition new to the channel is launched, and
 * so is the same one again after the group was hidden and shown. Channel to
 * group: what the user changes in the pane goes back into the group's tools,
 * which is what the persisted stack and a share carry. The launch is queued
 * as a state update, so until the channel reflects it nothing is written
 * back; the stale channel would otherwise overwrite the definition just
 * launched.
 *
 * Leaving the active state, by hiding the group, by another group taking
 * over or by the group going away, switches the comparison off.
 */
const ComparingEngine = ({
  group,
  definition,
  active,
  onDefinitionChange,
}: WorkflowEngineProps<CompareDefinition>) => {
  const {
    isOn,
    setOn,
    startComparison,
    isComparisonRunning,
    definition: channelDefinition,
  } = useComparingActions();
  const definitionKey = seedKey(definition);

  const isRunningRef = useRef(isComparisonRunning);
  isRunningRef.current = isComparisonRunning;
  /**
   * The channel value a launch was queued against. While the channel still
   * holds it the launch has not landed, and the channel says nothing about
   * this group yet.
   */
  const launchedAgainstRef = useRef<CompareDefinition | undefined | null>(null);
  const channelRef = useRef(channelDefinition);
  channelRef.current = channelDefinition;

  useEffect(() => {
    if (!active) {
      return;
    }
    if (!isRunningRef.current(definition)) {
      launchedAgainstRef.current = channelRef.current;
    }
    // a functional update: sees the channel after a sibling's cleanup switched
    // it off, and leaves a channel that already runs this definition alone
    startComparison(definition);
    // the definition is a fresh object per render; its key is the identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, definitionKey, startComparison]);

  useEffect(() => {
    if (!active) {
      return;
    }
    return () => {
      setOn(false);
    };
  }, [active, setOn]);

  useEffect(() => {
    if (!active || !isOn || !channelDefinition) {
      return;
    }
    if (launchedAgainstRef.current !== null) {
      if (channelDefinition === launchedAgainstRef.current) {
        return;
      }
      launchedAgainstRef.current = null;
    }
    if (seedKey(channelDefinition) === definitionKey) {
      return;
    }
    onDefinitionChange(channelDefinition);
  }, [active, isOn, channelDefinition, definitionKey, onDefinitionChange]);

  useEffect(() => {
    if (import.meta.env.DEV) {
      console.debug("[WORKFLOW] comparing engine", {
        group: group.id,
        active,
      });
    }
  }, [group.id, active]);

  return null;
};

type CaptureSnapshot = { compareState?: CompareState };

/**
 * The running comparison as a workflow layer: the definition as it stands
 * and, as members, the layers on the stack that sit in at least one panel.
 * The background is never a member (a group cannot hold it); its assignment
 * stays in the definition and resolves against whatever background the map
 * has when the group comes back.
 */
export const comparingWorkflow: AddonWorkflowSpec<
  CompareDefinition,
  CaptureSnapshot
> = {
  capture: ({ snapshot, stack }) => {
    const state = snapshot.compareState;
    if (!state?.isOn) {
      return undefined;
    }
    const assigned = new Set(
      Object.entries(state.assignments ?? {})
        .filter(([, panels]) => panels.length > 0)
        .map(([key]) => key)
    );
    const members = getStackLayers([...stack]).filter(
      (layer) => assigned.has(layer.id) && !layer.id.startsWith("__")
    );
    if (members.length === 0) {
      return undefined;
    }
    const definition = toCompareDefinition(state);
    const titles = members.map((layer) => layer.title);
    return {
      definition,
      memberIds: members.map((layer) => layer.id),
      suggestedTitle: `Vergleich: ${titles.join(" / ")}`,
      description: `Vergleich von ${titles.join(" und ")} (${describeLayout(
        definition
      )}, ${definition.panelCount} Karten).`,
    };
  },
  seed: seedCompareDefinition,
  Engine: ComparingEngine,
  exclusive: true,
  icon: "comparing",
  triggerIcon: faSliders,
  label: "Vergleich",
};

