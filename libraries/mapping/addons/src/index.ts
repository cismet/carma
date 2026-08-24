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
  isImplementedKind,
  isSwitchableKind,
  SWITCHABLE_KINDS,
} from "./lib/addon-overrides";
export type { AddonOverridesState } from "./lib/addon-overrides";
export {
  ADDON_OVERRIDES_STORAGE_KEY,
  addonOverridesStorageKey,
  loadAddonOverrides,
  saveAddonOverrides,
  usePersistedAddonOverrides,
} from "./lib/addon-overrides-storage";

export {
  isCagedAvailable,
  useIsCagedAvailable,
  useCageDisabled,
  useCreateBlendLayer,
  NO_CAGE_FLAG,
} from "./lib/caged-addons";
export type {
  BlendLayerHandle,
  BlendLayerOptions,
  CageIndicatorBadgeConfig,
} from "./lib/caged-addons";

export {
  TimeSlider,
  TimeSliderPanel,
  TimeSliderInteractionPanel,
  useTimeSliderActions,
  useTimeSeriesLauncher,
  useTimeSliderLayerRow,
  getTimeSliderRowSeed,
  TIME_SLIDER_ICON_COLOR,
  TIME_SLIDER_LAYER,
  TIME_SLIDER_LAYER_ID,
  TIME_SLIDER_PLAY_TOGGLE_ID,
  TIME_SLIDER_TOOLS_INTERACTION_ID,
  TIME_SLIDER_STATE_DEFAULT,
  type TimeSeriesDefinition,
  type TimeSliderConfig,
  type TimeSliderState,
  type UseTimeSliderLayerRowOptions,
} from "./addons/TimeSlider";

export { useAddonState, useAddonStateSnapshot } from "./lib/AddonStateContext";
export type { AddonStateAction } from "./lib/AddonStateContext";

export { AddonManager, type AddonManagerConfig } from "./addons/AddonManager";
export {
  CameraRestriction,
  type CameraRestrictionConfig,
} from "./addons/CameraRestriction";
export { GazetteerMode } from "./addons/GazetteerMode";
export { GazetteerSource } from "./addons/GazetteerSource";
export { HomeOverride, type HomeOverrideConfig } from "./addons/HomeOverride";
export {
  VectorHighlight,
  VectorHighlightControl,
  VectorHighlightShapeTools,
  useHighlightModeActions,
  useHighlightOwnsMapClicks,
  useHighlightLayerRow,
  HIGHLIGHT_LAYER,
  HIGHLIGHT_LAYER_ID,
  HIGHLIGHT_TOOLS_INTERACTION_ID,
  HIGHLIGHT_OPERATIONS_TOGGLE_ID,
  HIGHLIGHT_SHAPES_TOGGLE_ID,
  HighlightInteractionPanel,
  ShapeToolbar,
  HighlightModeButton,
  DEFAULT_SHAPES,
  SHAPE_ICONS,
  SHAPE_LABELS,
  OPERATION_ICONS,
  OPERATION_LABELS,
} from "./addons/VectorHighlight";
export {
  NearestFeature,
  NearestFeatureApotheken,
  useNearestFeatureCategory,
  type NearestFeatureApothekenConfig,
  type NearestFeatureCategory,
  type NearestFeatureCategoryConfig,
  type NearestFeatureCategoryState,
  type NearestFeatureConfig,
} from "./addons/NearestFeature";
export {
  collectNearestFromIndex,
  primeFeatureIndexes,
  type FeatureIndex,
  type FeatureIndexStatus,
  type IndexedFeatureEntry,
  type NearestFromIndexOptions,
  type NearestFromIndexResult,
} from "./lib/featureIndex";
export {
  resolveStackedSources,
  styleLayerIdsForSource,
  type StackedSource,
} from "./lib/stackedSources";
export type {
  OperationColors,
  HighlightModeState,
  VectorHighlightConfig,
  VectorHighlightControlConfig,
  VectorHighlightShapeToolsProps,
  UseHighlightLayerRowOptions,
  ShapeToolbarProps,
  ShapeToolbarClassNames,
  HighlightOperation,
  HighlightModeButtonProps,
} from "./addons/VectorHighlight";
export {
  LayerVisibility,
  type LayerVisibilityConfig,
} from "./addons/LayerVisibility";
export { LibreTerrain, type LibreTerrainConfig } from "./addons/LibreTerrain";
export { OutletAddon, type OutletConfig } from "./addons/outlet/Outlet";
export {
  CompareSwipe,
  type CompareSwipeConfig,
} from "./addons/comparing/CompareSwipe";
export {
  CompareArena,
  type CompareArenaConfig,
} from "./addons/comparing/CompareArena";
export {
  COMPARE_MODE,
  orientationApplies,
  type CompareMode,
  type CompareOrientation,
} from "./addons/comparing/compare-modes";
export {
  ComparingControl,
  type ComparingControlConfig,
} from "./addons/comparing/ComparingControl";
export {
  useComparingActions,
  type CompareState,
} from "./addons/comparing/comparing-actions";
export {
  useComparingLayerRow,
  COMPARING_LAYER,
  COMPARING_LAYER_ID,
  COMPARING_TOOLS_INTERACTION_ID,
  type UseComparingLayerRowOptions,
} from "./addons/comparing/comparing-layer-row";
export { ComparingPanel } from "./addons/comparing/ComparingPanel";
export {
  useCompareLayerEntries,
  type CompareLayerEntry,
} from "./addons/comparing/comparing-layers";
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

export { ADDON_INTERACTION_COMPONENTS } from "./lib/interaction-components";
