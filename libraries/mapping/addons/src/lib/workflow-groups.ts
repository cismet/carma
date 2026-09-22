import {
  isLayerGroup,
  type LayerGroup,
  type LayerStackEntry,
} from "@carma-mapping/layers";

import {
  addonRegistry,
  resolveAddonEntries,
  type AddonEntry,
  type AddonKind,
  type AddonStateMap,
} from "./registry";
import type { AddonWorkflowSpec } from "./workflow";

/** the registry's workflow specs, with the per-kind generics erased */
export type ErasedWorkflowSpec = AddonWorkflowSpec<
  unknown,
  Partial<AddonStateMap>
>;

export type ResolvedWorkflowGroup = {
  group: LayerGroup;
  kind: AddonKind;
  spec: ErasedWorkflowSpec;
  definition: unknown;
};

/** the workflow spec a kind registered, if any */
export const getWorkflowSpec = (
  kind: AddonKind
): ErasedWorkflowSpec | undefined =>
  addonRegistry[kind].workflow as ErasedWorkflowSpec | undefined;

/**
 * Whether a stack entry is a workflow layer: a group whose tools name a kind
 * with a workflow spec, carrying a definition that spec can read. A group
 * from a link whose kind this build lacks resolves to nothing and stays a
 * plain group with its members.
 */
export const resolveWorkflowGroup = (
  entry: LayerStackEntry
): ResolvedWorkflowGroup | undefined => {
  if (!isLayerGroup(entry)) {
    return undefined;
  }
  for (const tool of resolveAddonEntries(entry.tools as AddonEntry[])) {
    const spec = getWorkflowSpec(tool.kind);
    if (!spec) {
      continue;
    }
    const definition = spec.seed(tool.config);
    return definition === undefined
      ? undefined
      : { group: entry, kind: tool.kind, spec, definition };
  }
  return undefined;
};

export const resolveWorkflowGroups = (
  stack: readonly LayerStackEntry[]
): ResolvedWorkflowGroup[] =>
  stack
    .map(resolveWorkflowGroup)
    .filter((entry): entry is ResolvedWorkflowGroup => entry !== undefined);

export const isWorkflowGroup = (entry: LayerStackEntry): boolean =>
  resolveWorkflowGroup(entry) !== undefined;

/** a fresh id for a captured workflow group */
export const workflowGroupId = (kind: AddonKind): string =>
  `workflow:${kind}:${Date.now().toString(36)}`;
