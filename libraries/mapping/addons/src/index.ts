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
  getAddonKind,
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
  BareAddonKind,
  ResolvedAddon,
} from "./lib/registry";

export {
  applyAddonOverrides,
  isHostMountedKind,
  isSwitchableKind,
  SWITCHABLE_KINDS,
} from "./lib/addon-overrides";
export type { AddonOverridesState } from "./lib/addon-overrides";

export { useAddonState, useAddonStateSnapshot } from "./lib/AddonStateContext";
export type { AddonStateAction } from "./lib/AddonStateContext";

export { AddonManager, type AddonManagerConfig } from "./addons/AddonManager";
export {
  CameraRestriction,
  type CameraRestrictionConfig,
} from "./addons/CameraRestriction";
export { GazetteerMode } from "./addons/GazetteerMode";
export { GazetteerSource } from "./addons/GazetteerSource";
export {
  HomeOverride,
  type HomeOverrideConfig,
} from "./addons/HomeOverride";
export {
  VectorHighlight,
  VectorHighlightControl,
  VectorHighlightShapeTools,
  ShapeToolbar,
  HighlightModeButton,
  DEFAULT_SHAPES,
  SHAPE_ICONS,
  SHAPE_LABELS,
} from "./addons/VectorHighlight";
export type {
  HighlightModeState,
  VectorHighlightConfig,
  VectorHighlightControlConfig,
  VectorHighlightShapeToolsProps,
  ShapeToolbarProps,
  ShapeToolbarClassNames,
  HighlightModeButtonProps,
} from "./addons/VectorHighlight";
export {
  LayerVisibility,
  type LayerVisibilityConfig,
} from "./addons/LayerVisibility";
export { OutletAddon, type OutletConfig } from "./addons/outlet/Outlet";
export {
  InfoBoxZoomImage,
  resolveInfoBoxImageUrl,
  type InfoBoxImageState,
  type InfoBoxImageStep,
  type InfoBoxZoomImageConfig,
} from "./addons/InfoBoxZoomImage";
export {
  VisibleFeatureStatsSource,
  type LayerStatsGroup,
  type LayerStatsRow,
  type MarkShape,
  type VisibleFeatureStatsSourceConfig,
  type VisibleFeatureStatsState,
} from "./addons/VisibleFeatureStatsSource";
export {
  zoomToExtentTrigger,
  type ZoomToExtentConfig,
} from "./addons/ZoomToExtent";
export {
  StatsReadout,
  VisibleFeatureStatsPanel,
  type ColoredStatsGroup,
  type VisibleFeatureStatsPanelConfig,
} from "./addons/VisibleFeatureStatsPanel";
