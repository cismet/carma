import "./lib/interaction/annotation-overlay-line-label.css";

export {
  AnnotationOverlayRoots,
  AnnotationPreviewOverlayRoots,
} from "./lib/components/AnnotationPreviewOverlayRoots";
export {
  RuntimeAnnotationsToolbar,
  type AnnotationsToolbarClassNames,
  type AnnotationsToolbarMetrics,
  type RuntimeAnnotationsToolbarProps,
} from "./lib/components/RuntimeAnnotationsToolbar";
export { RuntimeAnnotationInfoBox } from "./lib/components/annotation-info-box/RuntimeAnnotationInfoBox";
export {
  useRuntimeAnnotationInfoBoxSlots,
  RUNTIME_ANNOTATION_INFO_BOX_SLOT_STATE_KINDS,
  type RuntimeAnnotationInfoBoxSlotsState,
  type RuntimeAnnotationInfoBoxSlotStateKind,
  type RuntimeAnnotationInfoBoxVisualOptionsContext,
  type RuntimeAnnotationInfoBoxVisualOptionsInput,
  type UseRuntimeAnnotationInfoBoxSlotsOptions,
} from "./lib/components/annotation-info-box/use-runtime-annotation-info-box-slots";
export {
  ANNOTATION_MEASUREMENT_SELECTED_HIGHLIGHT_PALETTE,
  ANNOTATION_MEASUREMENT_TEXT_COLOR,
} from "./lib/config/annotation-measurement-label-theme-defaults";
export {
  ANNOTATION_MEASUREMENT_DEFAULT_LABEL_THEME,
  resolveStoredAnnotationLabelTheme,
} from "./lib/config/annotation-measurement-label-themes";
export type {
  StoredAnnotationLabelTheme,
  StoredAnnotationQualitativeColorScheme,
} from "./lib/config/annotation-measurement-label-themes";
export { typographyDefaults } from "./lib/config/annotation-typography-defaults";
export type { TypographyDefaults } from "./lib/config/annotation-typography-defaults";
export type { AnnotationsRuntimeFormatOptions } from "./lib/config/annotations-runtime-format-options";
export {
  AREA_OCCLUSION_STYLE_DEFAULTS,
  isCoplanarPolygonFillPlacement,
  resolveAreaOcclusionLineRenderOptions,
  resolveAreaOcclusionStyleOptions,
  resolveAreaOverlayFillColor,
} from "./lib/config/area-occlusion-style-options";
export type {
  AreaOcclusionLineRenderOptions,
  AreaOcclusionStyleOptions,
  ResolvedAreaOcclusionStyleOptions,
} from "./lib/config/area-occlusion-style-options";
export {
  MEASUREMENT_LINE_STYLE_DEFAULTS,
  resolveMeasurementLineStyleOptions,
} from "./lib/config/measurement-line-style-options";
export type {
  MeasurementLineStyleOptions,
  ResolvedMeasurementLineStyleOptions,
} from "./lib/config/measurement-line-style-options";
export {
  applySelectedEdgeVisualStyle,
  applySelectedPointMarkerVisualStyle,
  measurementVisualDefaults,
  measurementVisualStyles,
  withEdgeVisualStyle,
  withPointMarkerVisualStyle,
} from "./lib/config/measurement-visual-defaults";
export type {
  EdgeVisualStyle,
  MeasurementVisualDefaults,
  PointMarkerVisualStyle,
} from "./lib/config/measurement-visual-defaults";
export { pointLabelVisualDefaults } from "./lib/config/runtime-point-label-visual-defaults";
export { previewControllerDefaults } from "./lib/config/preview-controller-defaults";
export { ANNOTATION_THEME_STYLE } from "./lib/config/annotation-theme-style";
export type { AnnotationThemeStyle } from "./lib/config/annotation-theme-style";
export {
  ANNOTATION_LINE_LABEL_BACKGROUND_STYLE,
  ANNOTATION_LINE_LABEL_COLLISION_RESOLUTION_STRATEGY,
  annotationLineLabelDefaults,
} from "./lib/config/annotation-line-label-options";
export type {
  PartialAnnotationLineLabelOptions,
  AnnotationLineLabelAppearanceOptions,
  AnnotationLineLabelBackgroundOptions,
  AnnotationLineLabelCollisionOptions,
  AnnotationLineLabelCollisionResolutionStrategy,
  AnnotationLineLabelLayoutOptions,
  AnnotationLineLabelTextOptions,
  AnnotationLineLabelOptions,
} from "./lib/config/annotation-line-label-options";
export {
  AnnotationsProvider,
  useAnnotationLabelTextDialogState,
  useAnnotationsRuntime,
} from "./lib/context/AnnotationsProvider";
export {
  useAnnotationLabelTextRequest,
  type AnnotationLabelTextDialogState,
  type AnnotationLabelTextRequestContext,
  type AnnotationLabelTextRequester,
  type AnnotationLabelTextRequestState,
  type UseAnnotationLabelTextRequestOptions,
} from "./lib/context/use-annotation-label-text-request";
export {
  flyToAnnotationIds,
  flyToAnnotationPoints,
  resolveAnnotationIdsCartesianPoints,
} from "./lib/context/annotation-fly-to";
export type { RuntimeAnnotationInfoBoxContext } from "./lib/components/annotation-info-box/annotation-info-box.types";
export { resolveRuntimeMeasurementNavigation } from "./lib/components/annotation-info-box/runtime-measurement-navigation";
export { createPointQueryController } from "./lib/interaction/create-point-query-controller";
export {
  CROSSHAIR_CURSOR_STYLES,
  resolveCrosshairCursorCssValue,
} from "./lib/interaction/crosshair-cursor-asset";
export {
  applyLineLabel,
  applyLineRuntime,
  buildPreviewDistanceTriangleLabelReferences,
  clearLineRuntime,
  createAnnotationOverlayLayer,
  createAnnotationOverlayLayers,
  createLineCollection,
  createLineRuntime,
  createPreviewOverlayLayer,
  createPreviewSegmentScratch,
  createSegmentLineLabels,
  destroyLineCollection,
  destroyAnnotationOverlayLayer,
  destroyPreviewOverlayLayer,
  hideLineLabels,
  hidePointMarkers,
  placePointMarkers,
  resolvePreviewDistanceTriangleComponentLabelVisibility,
} from "./lib/interaction/authoring-visual-runtime";
export { createPolygonAuthoringController } from "./lib/interaction/create-polygon-authoring-controller";
export { createSegmentAuthoringController } from "./lib/interaction/create-segment-authoring-controller";
export { createVerticalAreaAuthoringController } from "./lib/interaction/create-vertical-area-authoring-controller";
export { applySecondaryLineLabelPlacementStrategy } from "./lib/render/secondary-line-label-placement";
export { PointMarkerOverlayShell } from "./lib/render/point-marker-visualizer";
export { resolveSegmentGuideFrame } from "./lib/interaction/resolve-segment-guide-frame";
export {
  ANNOTATION_OVERLAY_GROUP,
  ANNOTATION_OVERLAY_GROUP_RENDER_ORDER,
  PREVIEW_OVERLAY_GROUP,
  PREVIEW_OVERLAY_GROUP_RENDER_ORDER,
  resolveAnnotationOverlayMountConfig,
  resolvePreviewOverlayMountConfig,
} from "./lib/interaction/preview-overlay-mount.shared";
export type { CrosshairCursorStyle } from "./lib/interaction/crosshair-cursor-asset";
export type { PointQueryController } from "./lib/interaction/point-query-controller.types";
export { POINT_QUERY_DISC_PLACEMENT_MODES } from "./lib/interaction/point-query-disc-placement-mode";
export type { PointQueryDiscPlacementMode } from "./lib/interaction/point-query-disc-placement-mode";
export type {
  AnnotationOverlayGroup,
  PreviewOverlayGroup,
} from "./lib/interaction/preview-overlay-mount.shared";
export { useLocalAnnotationsRuntimePersistence } from "./lib/store/persistence/useLocalAnnotationsStorePersistence";
export {
  ANNOTATION_ELEVATION_DISPLAY_MODES,
  buildNodeLinkIdByNodeId,
  removeAnnotationById,
  setElevationReferenceAnnotationId,
  updateAnnotationEntryById,
  useAnnotationsDispatch,
} from "./lib/store";
export type {
  AddAnnotationOptions,
  AnnotationEdge,
  AnnotationElevationDisplayMode,
  AnnotationNode,
  AnnotationNodeLink,
  AnnotationNodeLinkId,
  AnnotationsStore,
  AnnotationsStoreState,
  CesiumGeographicCoordinate,
  StoredAnnotation,
} from "./lib/store";
export {
  ANNOTATION_TOOL_PLUGIN_KINDS,
  ANNOTATION_TOOL_PLUGIN_CAPABILITIES,
  listAnnotationToolShortcuts,
  resolveAnnotationToolShortcutTarget,
  AUTHORING_MEASUREMENT_PLUGIN_CAPABILITIES,
  BASE_MEASUREMENT_PLUGIN_CAPABILITIES,
  createInteractionToolPlugin,
  createMeasurementToolPlugin,
  INTERACTION_PLUGIN_CAPABILITIES,
  KEYBOARD_MEASUREMENT_PLUGIN_CAPABILITIES,
  type AnnotationToolAddAnnotationContext,
  type AnnotationToolAuthoringContext,
  type AnnotationToolAuthoringController,
  type AnnotationToolDescriptor,
  type AnnotationToolDraftState,
  type AnnotationToolDraftStore,
  type AnnotationToolKeyboardContext,
  type AnnotationToolPlugin,
  type AnnotationToolPluginCapability,
  type AnnotationToolPluginKind,
  type AnnotationToolRegistry,
  type AnnotationToolSessionContext,
  type AnnotationToolVisualModelContext,
  type PointQueryCreatedContext,
  type PointQueryPickResult,
} from "./lib/registry";
export {
  resolveDistanceTriangleAnchorCoordinateRole,
  resolveDistanceTriangleAnchorCoordinateSelection,
  resolveOppositePointLabelCoordinateSelection,
} from "./lib/render/distance-triangle-overlay";
export {
  RUNTIME_POINT_LABEL_COORDINATE_SELECTION,
  RUNTIME_POLYGON_FILL_PLACEMENT,
} from "./lib/render/measurement-render-models";
export type {
  RuntimeEdgeRenderModel,
  RuntimePointLabelCoordinateCandidate,
  RuntimePointLabelRenderModel,
  RuntimePointMarkerRenderModel,
  RuntimePolygonFillPlacement,
  RuntimePolygonFillRenderModel,
} from "./lib/render/measurement-render-models";
export {
  buildRuntimeNodeCoordinateMap,
  resolveMeasurementCoordinates,
} from "./lib/render/resolve-measurement-coordinates";
export { areCoordinateListsEqual } from "./lib/utils/coordinate-equality";
export {
  CARDINAL_BEARING_FORM,
  CARDINAL_BEARING_LOCALE,
  formatCardinalBearing,
} from "./lib/utils/format-cardinal-bearing";
export type {
  CardinalBearingForm,
  CardinalBearingLocale,
} from "./lib/utils/format-cardinal-bearing";
export { resolveBearingRadFromFirstToLastCoordinate } from "./lib/utils/resolve-bearing-rad-from-first-to-last-coordinate";
export {
  areAnnotationEntriesHidden,
  resolveAnnotationCountByToolType,
  resolveAnnotationEntriesByToolType,
  resolveAnnotationIdsByToolType,
  resolveAnnotationToolFallbackPlugin,
  resolvePrimaryAnnotationInteractionToolId,
  resolveVisibleMeasurementAnnotationToolPlugins,
} from "./lib/utils/annotation-tool-collections";
export type { ResolveVisibleMeasurementAnnotationToolPluginsOptions } from "./lib/utils/annotation-tool-collections";
