import type { ComponentType } from "react";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";

import type { LayerGroup, LayerStackEntry } from "@carma-mapping/layers";

/**
 * The contract an addon opts into to become a workflow layer: one layer
 * button that carries the addon's definition and the layers it acts on, and
 * behaves like any other layer from then on.
 *
 * The button is a plain `LayerGroup`: its `layers` are the captured members,
 * its `tools` hold exactly one entry, the addon kind with its serialisable
 * definition as the config. Groups already give the host visibility, removal,
 * reorder, opacity masked onto the members, persistence and the additive
 * share, so the addon contributes only what is its own: how to capture the
 * running state into a definition, how to read one back, and an engine that
 * binds one group to the addon's session channel.
 *
 * Dependency-free on purpose: the registry imports this for its entry type,
 * and the addons' workflow specs import it too.
 */

export type WorkflowCaptureContext<TSnapshot = unknown> = {
  /** the addon state channels as they stand */
  snapshot: TSnapshot;
  /** the host's layer stack as it stands */
  stack: readonly LayerStackEntry[];
};

export type WorkflowCapture<TDefinition> = {
  definition: TDefinition;
  /** the ids of the layers the workflow acts on; they become the group's members */
  memberIds: string[];
  /** what the title prompt is prefilled with */
  suggestedTitle: string;
  /**
   * What the group's info view says about the workflow. A group opens its
   * info view only when it has something to show, so this is also what makes
   * the button behave like a layer's.
   */
  description?: string;
};

export type WorkflowEngineProps<TDefinition> = {
  group: LayerGroup;
  definition: TDefinition;
  /**
   * Whether this group is the one driving the engine: false while the group
   * is hidden, or while another group of an exclusive kind sits above it.
   */
  active: boolean;
  /** hands an edited definition back to the group, which persists it */
  onDefinitionChange: (definition: TDefinition) => void;
};

export type AddonWorkflowSpec<TDefinition, TSnapshot = unknown> = {
  /**
   * The running state as a definition, with the layers it acts on; undefined
   * while there is nothing to capture (the mode is off, nothing assigned).
   */
  capture: (
    ctx: WorkflowCaptureContext<TSnapshot>
  ) => WorkflowCapture<TDefinition> | undefined;
  /**
   * The definition out of a group's tool config, or undefined when the config
   * is not usable. The config comes back from persisted state or a shared
   * link, so nothing has checked its shape yet.
   */
  seed: (config: unknown) => TDefinition | undefined;
  /** headless binding of one group to the engine, mounted by `WorkflowGroupHost` */
  Engine: ComponentType<WorkflowEngineProps<TDefinition>>;
  /** only one group of this kind runs at a time; the others are paused */
  exclusive?: boolean;
  /** the group's layer icon, a key of the layer icon mapping */
  icon: string;
  /** the trigger icon on the group's button */
  triggerIcon: IconDefinition;
  /** what the workflow is called, for the capture button and the title prompt */
  label: string;
};

/** what a group's button shows for a workflow group, keyed by group id */
export type WorkflowActivityState = Record<
  string,
  { kind: string; status: "running" | "paused" }
>;
