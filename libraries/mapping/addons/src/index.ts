export { AddonHost } from "./lib/AddonHost";
export { TargetAddonHost } from "./lib/TargetAddonHost";
export {
  getTargetAddonsWithTrigger,
  hasTargetAddonsWithTrigger,
  resolveActiveTargetAddon,
  toAddonButtonId,
} from "./lib/target-addons";
export {
  addonRegistry,
  normalizeAddonEntries,
  resolveAddonEntries,
  resolveAddonTrigger,
} from "./lib/registry";
export type {
  Addon,
  AddonComponentProps,
  AddonConfigMap,
  AddonContext,
  AddonEntry,
  AddonKind,
  AddonRegistryEntry,
  AddonStateKey,
  AddonStateMap,
  AddonTrigger,
  ResolvedAddon,
} from "./lib/registry";

export {
  useAddonState,
  useAddonStateSnapshot,
} from "./lib/AddonStateContext";
export type { AddonStateAction } from "./lib/AddonStateContext";

export { GazetteerMode } from "./addons/GazetteerMode";
export { GazetteerSource } from "./addons/GazetteerSource";
export { VectorHighlight } from "./addons/VectorHighlight";
export type { VectorHighlightConfig } from "./addons/VectorHighlight";
export {
  LayerVisibility,
  type LayerVisibilityConfig,
} from "./addons/LayerVisibility";
export { OutletAddon, type OutletConfig } from "./addons/outlet/Outlet";
export {
  VisibleFeatureStatsAddon,
  type VisibleFeatureStatsConfig,
} from "./lib/VisibleFeatureStatsAddon";
