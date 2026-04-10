export {
  AnnotationsProvider,
  useAnnotationsRuntime,
  useRuntimeCursor,
  type RuntimeAnnotationEntry,
  type RuntimeCoordinate,
  type RuntimeEdge,
  type RuntimeLinkedNodeGroupId,
  type RuntimeMeasurement,
  type RuntimeNode,
  type RuntimeRenderLayer,
} from "./lib/context/AnnotationsProvider";
export type { AnnotationsRuntimeFormatOptions } from "./lib/config/annotationsRuntimeFormatOptions";
export {
  ANNOTATION_MEASUREMENT_TEXT_COLOR,
  ANNOTATION_MEASUREMENT_SELECTED_HIGHLIGHT_PALETTE,
  ANNOTATION_MEASUREMENT_QUALITATIVE_DARK_COLOR_SCHEMES,
  ANNOTATION_MEASUREMENT_LABEL_THEME_BY_TOOL_TYPE,
  resolveAnnotationMeasurementLabelTheme,
  type AnnotationMeasurementQualitativeColorScheme,
  type AnnotationMeasurementSelectedHighlightPalette,
  type AnnotationMeasurementLabelTheme,
} from "./lib/config/annotationMeasurementLabelThemes";
export {
  annotationTypographyDefaults,
  type AnnotationTypographyDefaults,
} from "./lib/config/annotationTypographyDefaults";
export {
  previewControllerDefaults,
  type PreviewControllerOptions,
} from "./lib/config/previewControllerDefaults";
export {
  PREVIEW_LINE_LABEL_BACKGROUND_STYLE,
  PREVIEW_LINE_LABEL_THEME,
  previewLineLabelVisualDefaults,
  resolvePreviewLineLabelVisualOptions,
  type PreviewLineLabelBackgroundStyle,
  type PreviewLineLabelTheme,
  type PreviewLineLabelVisualOptions,
} from "./lib/config/previewLineLabelVisualDefaults";
export {
  buildAnnotationsRuntimePersistenceState,
  resolvePersistedAnnotationsStoreState,
  saveAnnotationsRuntimePersistenceState,
  loadAnnotationsRuntimePersistenceState,
  type AnnotationsRuntimePersistenceEnvelopeV1,
  type AnnotationsRuntimePersistenceEnvelopeV2,
  type AnnotationsRuntimePersistenceEnvelopeV3,
  type AnnotationsRuntimePersistenceEnvelopeV4,
  type AnnotationsRuntimePersistenceEnvelopeV5,
  type AnnotationsRuntimePersistenceEnvelope,
} from "./lib/persistence/annotationsRuntimePersistence";
export { useLocalAnnotationsRuntimePersistence } from "./lib/persistence/useLocalAnnotationsRuntimePersistence";
export { RuntimeAnnotationInfoBox } from "./lib/components/annotation-info-box/RuntimeAnnotationInfoBox";
export type {
  RuntimeAnnotationInfoBoxSlots,
  RuntimeAnnotationInfoBoxContext,
  RuntimeAnnotationInfoBoxLayoutProps,
} from "./lib/components/annotation-info-box/annotationInfoBox.types";
export {
  runtimeAnnotationInfoBoxVisualDefaults,
  resolveRuntimeAnnotationInfoBoxVisualOptions,
  type RuntimeAnnotationInfoBoxVisualOptions,
} from "./lib/components/annotation-info-box/annotationInfoBoxVisualDefaults";
export { RuntimeAnnotationInfoBoxActionIcon } from "./lib/components/annotation-info-box/RuntimeAnnotationInfoBoxActionIcon";
export { RuntimeAnnotationInfoBoxNavigation } from "./lib/components/annotation-info-box/RuntimeAnnotationInfoBoxNavigation";
export {
  POINT_QUERY_PREVIEW_DISC_PLACEMENT_MODES,
  POINT_QUERY_PREVIEW_TANGENT_PLANE_FAILURE_REASONS,
  createPointQueryPreviewController,
  type PointQueryPreviewDiscPlacementMode,
  type PointQueryPreviewControllerOptions,
  type PointQueryPreviewTangentPlaneFailureReason,
  type PointQueryPreviewTangentPlaneFailure,
  type PointQueryPreviewDiscOriginJump,
  type PointQueryPreviewDiscScaleChange,
  type PointQueryPreviewTelemetryEntry,
  type PointQueryPreviewControllerTelemetrySnapshot,
  type PointQueryPreviewController,
} from "./lib/interaction/createPointQueryPreviewController";
export {
  CROSSHAIR_CURSOR_SIZE_PX,
  CROSSHAIR_CURSOR_ANCHOR_PX,
  SIMPLE_HAIRLINE_CURSOR_SIZE_SERIES_PX,
  CROSSHAIR_CURSOR_STYLES,
  resolveCrosshairCursorRasterMetrics,
  buildCrosshairCursorDataUrl,
  resolveCrosshairCursorCssValue,
  type CrosshairCursorStyle,
  type CrosshairCursorRenderOptions,
  type CrosshairCursorCssValueOptions,
  type CrosshairCursorRasterMetrics,
} from "./lib/interaction/crosshairCursorAsset";
export { resolvePointPreviewDiscRadius } from "./lib/interaction/resolvePointPreviewDiscRadius";
export { resolveCrosshairCanvasCursor } from "./lib/interaction/resolveCrosshairCanvasCursor";
export {
  ANNOTATION_TOOL_PLUGIN_KINDS,
  ANNOTATION_TOOL_PLUGIN_CAPABILITIES,
  buildAnnotationToolRegistry,
  createAnnotationToolPlugin,
  defaultAnnotationToolPlugins,
  INTERACTION_PLUGIN_CAPABILITIES,
  POINT_MEASUREMENT_PLUGIN_CAPABILITIES,
  NODE_CHAIN_MEASUREMENT_PLUGIN_CAPABILITIES,
  createInteractionToolPlugin,
  createMeasurementToolPlugin,
  areaGroundToolPlugin,
  areaPlanarToolPlugin,
  distanceToolPlugin,
  labelToolPlugin,
  pointToolPlugin,
  polylineToolPlugin,
  selectToolPlugin,
  verticalAreaToolPlugin,
  type AnnotationToolPluginKind,
  type AnnotationToolPluginCapability,
  type AnnotationToolDescriptor,
  type AnnotationToolSessionContext,
  type PointQueryCreatedContext,
  type AnnotationToolPreviewSample,
  type AnnotationToolPreviewController,
  type AnnotationToolPreviewContext,
  type AnnotationToolKeyboardContext,
  type AnnotationToolRenderLayerContext,
  type AnnotationToolPlugin,
  type AnnotationToolRegistry,
} from "./lib/tools";
