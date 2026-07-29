export { AddonHost } from "./lib/AddonHost";
export { TargetAddonHost } from "./lib/TargetAddonHost";
export {
  getTargetAddonsWithButton,
  hasTargetAddonsWithButton,
  resolveActiveTargetAddon,
  toAddonButtonId,
} from "./lib/target-addons";
export {
  addonRegistry,
  normalizeAddonEntries,
  resolveAddonEntries,
  resolveAddonLayerButton,
} from "./lib/registry";
export type {
  Addon,
  AddonComponentProps,
  AddonConfigMap,
  AddonContext,
  AddonEntry,
  AddonKind,
  AddonLayerButton,
  AddonRegistryEntry,
  ResolvedAddon,
} from "./lib/registry";

export { GazetteerModeAddon } from "./lib/GazetteerModeAddon";
export { GazetteerSourceAddon } from "./lib/GazetteerSourceAddon";
export { VectorHighlightAddon } from "./lib/VectorHighlightAddon";
export type { VectorHighlightConfig } from "./lib/VectorHighlightAddon";
export {
  LayerVisibilityAddon,
  type LayerVisibilityConfig,
} from "./lib/LayerVisibilityAddon";
