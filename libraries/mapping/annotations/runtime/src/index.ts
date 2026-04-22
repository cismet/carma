import "./lib/interaction/annotation-overlay-line-label.css";

export { RuntimeAnnotationInfoBox } from "./lib/components/annotation-info-box/RuntimeAnnotationInfoBox";
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
  applySelectedEdgeVisualStyle,
  applySelectedPointMarkerVisualStyle,
  measurementVisualStyles,
  withEdgeVisualStyle,
  withPointMarkerVisualStyle,
} from "./lib/config/measurement-visual-defaults";
export type {
  EdgeVisualStyle,
  PointMarkerVisualStyle,
} from "./lib/config/measurement-visual-defaults";
export { pointLabelVisualDefaults } from "./lib/config/runtime-point-label-visual-defaults";
export { previewControllerDefaults } from "./lib/config/preview-controller-defaults";
export {
  PREVIEW_LINE_LABEL_BACKGROUND_STYLE,
  PREVIEW_LINE_LABEL_COLLISION_RESOLUTION_STRATEGY,
  PREVIEW_LINE_LABEL_THEME,
  previewLineLabelVisualDefaults,
} from "./lib/config/preview-line-label-visual-defaults";
export type {
  PreviewLineLabelCollisionResolutionStrategy,
  PreviewLineLabelTheme,
  PreviewLineLabelVisualOptions,
} from "./lib/config/preview-line-label-visual-defaults";
export {
  AnnotationsProvider,
  useAnnotationsRuntime,
} from "./lib/context/AnnotationsProvider";
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
  createLineCollection,
  createLineRuntime,
  createPreviewOverlayLayer,
  createPreviewSegmentScratch,
  createSegmentLineLabels,
  destroyLineCollection,
  destroyPreviewOverlayLayer,
  hideLineLabels,
  resolvePreviewDistanceTriangleComponentLabelVisibility,
} from "./lib/interaction/authoring-visual-runtime";
export { createPolygonAuthoringController } from "./lib/interaction/create-polygon-authoring-controller";
export { createSegmentAuthoringController } from "./lib/interaction/create-segment-authoring-controller";
export { createVerticalAreaAuthoringController } from "./lib/interaction/create-vertical-area-authoring-controller";
export { applySecondaryLineLabelPlacementStrategy } from "./lib/render/secondary-line-label-placement";
export { resolveSegmentGuideFrame } from "./lib/interaction/resolve-segment-guide-frame";
export {
  PREVIEW_OVERLAY_GROUP,
  PREVIEW_OVERLAY_GROUP_RENDER_ORDER,
  resolvePreviewOverlayMountConfig,
} from "./lib/interaction/preview-overlay-mount.shared";
export type { CrosshairCursorStyle } from "./lib/interaction/crosshair-cursor-asset";
export type { PointQueryController } from "./lib/interaction/point-query-controller.types";
export { POINT_QUERY_DISC_PLACEMENT_MODES } from "./lib/interaction/point-query-disc-placement-mode";
export type { PointQueryDiscPlacementMode } from "./lib/interaction/point-query-disc-placement-mode";
export type { PreviewOverlayGroup } from "./lib/interaction/preview-overlay-mount.shared";
export { useLocalAnnotationsRuntimePersistence } from "./lib/store/persistence/useLocalAnnotationsStorePersistence";
export {
  ANNOTATION_ELEVATION_DISPLAY_MODES,
  buildNodeLinkIdByNodeId,
  removeAnnotationById,
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
  type AnnotationToolId,
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
  formatGermanCardinalBearing,
  resolveBearingDegFromFirstToLastCoordinate,
} from "./lib/utils/german-cardinal-bearing";
