import "./lib/interaction/annotation-overlay-line-label.css";

export { RuntimeAnnotationInfoBox } from "./lib/components/annotation-info-box/RuntimeAnnotationInfoBox";
export {
  ANNOTATION_MEASUREMENT_SELECTED_HIGHLIGHT_PALETTE,
  ANNOTATION_MEASUREMENT_TEXT_COLOR,
} from "./lib/config/annotation-measurement-label-theme-defaults";
export { resolveStoredAnnotationLabelTheme } from "./lib/config/annotation-measurement-label-themes";
export type { StoredAnnotationQualitativeColorScheme } from "./lib/config/annotation-measurement-label-themes";
export { typographyDefaults } from "./lib/config/annotation-typography-defaults";
export type { TypographyDefaults } from "./lib/config/annotation-typography-defaults";
export type { AnnotationsRuntimeFormatOptions } from "./lib/config/annotations-runtime-format-options";
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
export { createPointQueryController } from "./lib/interaction/create-point-query-controller";
export {
  CROSSHAIR_CURSOR_STYLES,
  resolveCrosshairCursorCssValue,
} from "./lib/interaction/crosshair-cursor-asset";
export {
  applyLineLabel,
  buildPreviewDistanceTriangleLabelReferences,
  createSegmentLineLabels,
  hideLineLabels,
  resolvePreviewDistanceTriangleComponentLabelVisibility,
} from "./lib/interaction/authoring-visual-runtime";
export { applySecondaryLineLabelPlacementStrategy } from "./lib/render/secondary-line-label-placement";
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
export { useLocalAnnotationsRuntimePersistence } from "./lib/persistence/use-local-annotations-runtime-persistence";
export { defaultAnnotationToolPlugins } from "./lib/tools/default-annotation-tool-plugins";
export { areaGroundToolPlugin } from "./lib/tools/area-ground/area-ground-tool-plugin";
export { areaPlanarToolPlugin } from "./lib/tools/area-planar/area-planar-tool-plugin";
export { distanceToolPlugin } from "./lib/tools/distance/distance-tool-plugin";
export { labelToolPlugin } from "./lib/tools/label/label-tool-plugin";
export { pointToolPlugin } from "./lib/tools/point/point-tool-plugin";
export { polylineToolPlugin } from "./lib/tools/polyline/polyline-tool-plugin";
export { selectToolPlugin } from "./lib/tools/select/select-tool-plugin";
export { verticalAreaToolPlugin } from "./lib/tools/vertical-area/vertical-area-tool-plugin";
