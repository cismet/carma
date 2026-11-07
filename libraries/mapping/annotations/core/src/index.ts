export {
  buildDistanceTriangleLineLabelReferences,
  buildOutsideReferencePoint2D,
  computePolygonCentroid2D,
} from "./lib/distance-screen-space";
export type {
  DistanceTriangleLineLabelOutsideSigns,
  DistanceTriangleLineLabelReferences,
} from "./lib/distance-screen-space";
export { isPointMeasurementEntry } from "./lib/types/annotation-geometry-types";
export type {
  AnnotationMode,
  PointMeasurementEntry,
} from "./lib/types/annotation-geometry-types";
export type { AnnotationLabelAppearance } from "./lib/types/annotation-label";
export {
  ANNOTATION_AREA_PLANAR_BIGGEST_TRIANGLE_TOOL_ID,
  ANNOTATION_AREA_PLANAR_PCA_TOOL_ID,
  ANNOTATION_AREA_PLANAR_TRAPEZOID_TOOL_ID,
  ANNOTATION_SELECT_TOOL_ID,
  ANNOTATION_TYPES,
} from "./lib/types/annotation-types";
export type {
  AnnotationToolId,
  AnnotationType,
  AnnotationTypes,
  NodeChainAnnotation,
  PlanarPolygonPlane,
  PolygonType,
} from "./lib/types/annotation-types";
export {
  createAnnotationAreaPalette,
  defaultAnnotationAreaPalette,
  type AnnotationAreaPalette,
  type AnnotationAreaPaletteOptions,
} from "./lib/utils/annotation-area-palette";
export {
  ANNOTATION_LINE_COMPONENT_KINDS,
  annotationVisualDefaults,
  annotationVisualPalette,
  getAnnotationLineComponentCssColor,
  getAnnotationLineComponentLabelAccentCssColor,
  getAnnotationLabelTextCssColor,
  getAnnotationSelectionCssColor,
  getAnnotationShortLabelBackgroundRgb255,
  getAnnotationSurfaceAccentCssColor,
  getAnnotationSurfaceStrokeCssColor,
} from "./lib/utils/annotation-visual-tokens";
export { annotationTypographyTokens } from "./lib/utils/annotation-typography-tokens";
export { formatMeasurementShortLabelToken } from "./lib/utils/annotation-badge-tokens";
export {
  addAnnotationLabelTextHistoryEntry,
  mergeAnnotationLabelTextSuggestions,
  resolveAnnotationLabelTextRequest,
  resolveAnnotationLabelTextSuggestions,
} from "./lib/utils/annotation-label-text-history";
export {
  ANNOTATION_COMMON_SHORTCUT_ACTIONS,
  isManagedAnnotationKeyboardEvent,
  isSelectAllAnnotationKeyboardShortcut,
  renderAnnotationShortcutGlyph,
  resolveAnnotationCommonShortcutAction,
} from "./lib/utils/annotation-keyboard-shortcuts";
export { applyLabelAppearance } from "./lib/utils/annotation-label";
export {
  getAveragedCandidateRingNormal,
  pushCandidateRingSample,
} from "./lib/utils/candidate-ring-normal-smoothing";
export type { CandidateRingSample } from "./lib/utils/candidate-ring-normal-smoothing";
export { distanceVisualizationDefaults } from "./lib/utils/distance-visualization";
export {
  ANNOTATION_KEYBOARD_SHORTCUTS_SUSPENDED_ATTRIBUTE,
  isKeyboardTargetEditable,
} from "./lib/utils/dom";
export {
  computePlanarPolygonArea,
  computePolygonGroupDerivedData,
  projectPointOntoPlane,
} from "./lib/utils/planar-geometry";
export {
  createBestFitPlanePca,
  createPlaneFromFirstNonCollinearPoints,
  createPlaneFromLargestTriangle,
} from "./lib/utils/plane-fitting";
export {
  computePolylineSegmentLengthsMeters,
  computePolylineTotalLengthMeters,
} from "./lib/utils/polyline-length";
export { isPointInViewport } from "./lib/utils/screen-viewport";
export {
  buildVerticalRectangleCornerFromDiagonal,
  getVerticalRectanglePreviewAreaSquareMeters,
} from "./lib/visualization/vertical-rectangle-geometry";
export type { AnnotationGeographicCoordinate } from "./lib/types/annotation-geographic-coordinate";
export {
  GUIDE_NORMAL_EPSILON_SQUARED,
  createOrientedDiscMatrix,
  createEnuOrientedDiscMatrix,
  getDiscWorldRadius,
  resolveStableDiscNormal,
} from "./lib/geometry/disc";
export {
  ANNOTATION_ENGINE_KINDS,
  ANNOTATION_ENGINE_POINT_QUERY_INPUT_MODIFIERS,
  ANNOTATION_GIZMO_DISC_SCALING_MODES,
  ANNOTATION_POINT_QUERY_CLICK_STRATEGY,
  ANNOTATION_RING_MATERIAL_PRESETS,
  ANNOTATION_SCENE_POLYGON_FILL_PLACEMENT,
  type AnnotationEngineKind,
  type AnnotationEnginePointQueryInputModifier,
  type AnnotationGizmoDiscScalingMode,
  type AnnotationPointQueryClickStrategy,
  type AnnotationRingMaterialPreset,
  type AnnotationScenePolygonFillPlacement,
} from "./lib/engine/annotation-engine-constants";
export type {
  AnnotationClientPosition,
  AnnotationEngine,
  AnnotationEngineCapabilities,
  AnnotationEngineHooks,
  AnnotationEnginePointer,
  AnnotationFlyToOptions,
  AnnotationGizmoAxisCandidate,
  AnnotationGizmoLabels,
  AnnotationGizmoPoint,
  AnnotationGizmoRotationDelta,
  AnnotationPickRay,
  AnnotationPointMoveGizmoOptions,
  AnnotationDiscSizingOptions,
  AnnotationPointQueryConfig,
  AnnotationPointQueryCreatePayload,
  AnnotationPointQueryOptions,
  AnnotationProjectionOptions,
  AnnotationProjectionSnapshot,
  AnnotationProjectionState,
  AnnotationSceneConeOptions,
  AnnotationSceneDiscOptions,
  AnnotationSceneLineCollection,
  AnnotationSceneLineCollectionOptions,
  AnnotationSceneLineHandle,
  AnnotationSceneLineOptions,
  AnnotationSceneLineStyle,
  AnnotationSceneMarkerCollection,
  AnnotationSceneMarkerHandle,
  AnnotationSceneMarkerOptions,
  AnnotationSceneMarkerStyle,
  AnnotationScenePolygonFill,
  AnnotationScenePolygonFillsHandle,
  AnnotationScenePolygonFillsOptions,
  AnnotationScenePrimitiveHandle,
  AnnotationSceneRingOptions,
  AnnotationScreenPosition,
  AnnotationSurfacePick,
  AnnotationSurfacePickOptions,
} from "./lib/engine/annotation-engine.types";
export {
  areAnnotationProjectionSnapshotsEqual,
  isValidAnnotationEngine,
} from "./lib/engine/annotation-engine.helpers";
