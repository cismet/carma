export { AddonHost } from "./lib/AddonHost";
export { TargetAddonHost } from "./lib/TargetAddonHost";
export {
  getTargetAddonsWithTrigger,
  hasTargetAddonsWithTrigger,
  resolveActiveTargetAddon,
  resolveSecondaryViewTargetAddon,
  toAddonButtonId,
} from "./lib/target-addons";
export {
  addonRegistry,
  filterAddonsByAvailability,
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
  AddonWithKind,
  AddonWithName,
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
  FLOW_FIELD_OPTION_DEFAULTS,
  FLOW_FIELD_PARAM_DEFAULTS,
  NO_CAGE_FLAG,
} from "./lib/caged-addons";
export type {
  BlendLayerHandle,
  BlendLayerOptions,
  CageIndicatorBadgeConfig,
  FlowFieldParams,
  FlowFieldZoomProfileEntry,
  UvCorrection,
} from "./lib/caged-addons";
export { ADMIN_MODE_FLAG, useIsAdminMode } from "./lib/admin-mode";

export {
  ALWAYS_ON_TOP_KIND,
  isAlwaysOnTop,
  orderAlwaysOnTopLast,
} from "./addons/AlwaysOnTop";
export type { AlwaysOnTopConfig } from "./addons/AlwaysOnTop";

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

export {
  FlowField,
  FlowFieldTuningPanel,
  FlowFieldTuningInteractionPanel,
  useFlowFieldActions,
  useFlowFieldLauncher,
  useFlowFieldLayerRow,
  FLOW_FIELD_LAYER,
  FLOW_FIELD_LAYER_ID,
  FLOW_FIELD_STATUS_ID,
  FLOW_FIELD_TUNING_INTERACTION_ID,
  FLOW_FIELD_STATE_DEFAULT,
  type FlowFieldBackdrop,
  type FlowFieldConfig,
  type FlowFieldDefinition,
  type FlowFieldState,
  type FlowFieldTuning,
  type UseFlowFieldLayerRowOptions,
} from "./addons/FlowField";

export {
  VehicleAnimation,
  useVehicleAnimationActions,
  useVehicleAnimationLauncher,
  useVehicleAnimationLayerRow,
  getVehicleAnimationRowSeed,
  buildTrack,
  carParts,
  poseAt,
  projectStops,
  CAR_SHAPE_GTW15,
  VEHICLE_ANIMATION_LAYER,
  VEHICLE_ANIMATION_LAYER_ID,
  VEHICLE_ANIMATION_FOCUS_ID,
  VEHICLE_ANIMATION_PLAY_ID,
  VEHICLE_ANIMATION_STATUS_ID,
  VEHICLE_ANIMATION_STATE_DEFAULT,
  type CarShape,
  type Station,
  type Track,
  type TrackStop,
  type VehicleAnimationConfig,
  type VehicleAnimationDefinition,
  type VehicleAnimationState,
  type VehicleMode,
  type VehicleSchedule,
  type VehicleScheduleDefinition,
  type UseVehicleAnimationLayerRowOptions,
  type CarInfo,
  type SelectedCar,
} from "./addons/VehicleAnimation";

export {
  FloodSimulation,
  FloodPanel,
  FloodInteractionPanel,
  useFloodActions,
  useFloodLauncher,
  useFloodLayerRow,
  formatLevel,
  resolveLook,
  resolveTerrainSource,
  floodStateStorageKey,
  NRW_DGM1_TERRAIN,
  FLOOD_ICON_COLOR,
  FLOOD_LAYER,
  FLOOD_LAYER_ID,
  FLOOD_LEVEL_STEP,
  FLOOD_LOOK_BOUNDS,
  FLOOD_LOOK_DEFAULT,
  FLOOD_STATE_DEFAULT,
  FLOOD_STATE_STORAGE_KEY,
  FLOOD_TOOLS_INTERACTION_ID,
  type FloodDefinition,
  type FloodLook,
  type FloodRange,
  type FloodSimulationConfig,
  type FloodState,
  type FloodTerrainSource,
  type UseFloodLayerRowOptions,
} from "./addons/FloodSimulation";

export { useHasAddonStateProducer } from "./lib/addon-channels";
export {
  useAddonState,
  useAddonStateSnapshot,
  useRouteAddons,
} from "./lib/AddonStateContext";
export type { AddonStateAction } from "./lib/AddonStateContext";

export { AddonManager, type AddonManagerConfig } from "./addons/AddonManager";
export {
  CameraRestriction,
  type CameraRestrictionConfig,
} from "./addons/CameraRestriction";
export {
  AnnotationControl,
  AnnotationInteractionPanel,
  AnnotationOverlay,
  AnnotationShapeToolbar,
  ANNOTATION_LAYER,
  ANNOTATION_LAYER_ID,
  ANNOTATION_TOOLS_INTERACTION_ID,
  useAnnotationLayerRow,
  useAnnotationActions,
  type AnnotationControlConfig,
  type AnnotationOverlayConfig,
  type AnnotationShape,
  type AnnotationState,
  type UseAnnotationLayerRowOptions,
} from "./addons/Annotation";
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
  NearestFeatureBahnhoefe,
  NearestFeatureKrankenhaeuser,
  useNearestFeatureCategory,
  type NearestFeatureApothekenConfig,
  type NearestFeatureBahnhoefeConfig,
  type NearestFeatureKrankenhaeuserConfig,
  type NearestFeatureCategory,
  type NearestFeatureCategoryConfig,
  type NearestFeatureCategoryState,
  type NearestFeatureConfig,
} from "./addons/NearestFeature";
export {
  OriginSearch,
  useOriginLocation,
  useOriginLocationState,
  useOriginRequest,
  useReportOriginResolution,
  type OriginLocation,
  type OriginLocationState,
  type OriginResolution,
  type OriginSearchConfig,
} from "./addons/OriginSearch";
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
export {
  ShadowSimulation,
  type ShadowSimulationConfig,
} from "./addons/ShadowSimulation";
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
