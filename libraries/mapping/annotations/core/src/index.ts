export {
  buildDistanceTriangleInsidePoint2D,
  buildOutsideReferencePoint2D,
  buildVerticalDistanceLineScreenData,
  buildVerticalLabelReferencePoint2D,
  computePolygonCentroid2D,
  hasVisibleDistanceRelationComponentLines,
  isDistanceRelationHorizontalLineVisible,
  isDistanceRelationVerticalLineVisible,
} from "./lib/distance-screen-space";
export type { DistanceScreenTriangle } from "./lib/distance-screen-space";
export { ANNOTATION_CANDIDATE_KINDS } from "./lib/types/annotation-candidate";
export type { AnnotationCandidateKind } from "./lib/types/annotation-candidate";
export {
  isDistancePointEntry,
  isPointAnnotationEntry,
  isPointMeasurementEntry,
} from "./lib/types/annotation-cesium-types";
export type {
  AnnotationEntry,
  AnnotationMode,
  AnnotationPointEntry,
  DistancePointEntry,
  PointMeasurementEntry,
} from "./lib/types/annotation-cesium-types";
export type { AnnotationCreatePayload } from "./lib/types/annotation-create-payload";
export type { BaseAnnotationEntry } from "./lib/types/annotation-entry";
export { DEFAULT_POINT_LABEL_METRIC_MODE } from "./lib/types/annotation-label";
export type {
  AnnotationLabelAnchor,
  AnnotationLabelAppearance,
  PointLabelMetricMode,
} from "./lib/types/annotation-label";
export type { AnnotationPersistenceEnvelopeBase } from "./lib/types/annotation-persistence-types";
export {
  ANNOTATION_TOOL_TYPES,
  ANNOTATION_TYPES,
  isAreaToolType,
} from "./lib/types/annotation-types";
export type {
  AnnotationToolType,
  AnnotationToolTypes,
  AnnotationType,
  AnnotationTypes,
  DerivedNodeChainAnnotation,
  DerivedNodeChainAnnotationGeometry,
  NodeChainAnnotation,
  PlanarPolygonPlane,
  PolygonType,
} from "./lib/types/annotation-types";
export type { DerivedPolylinePath } from "./lib/types/derived-polyline-path";
export type { DistanceRelationRenderContext } from "./lib/types/distance-relation-render-context";
export {
  DEFAULT_LINEAR_SEGMENT_LINE_MODE,
} from "./lib/types/linear-segment";
export type { LinearSegmentLineMode } from "./lib/types/linear-segment";
export { fromAlphabeticSequence } from "./lib/utils/alphabetic-sequence";
export {
  annotationAreaPalette,
  getAnnotationAreaCssColor,
  getAnnotationAreaFillCssColor,
  getAnnotationAreaRgb255,
} from "./lib/utils/annotation-area-palette";
export {
  ANNOTATION_LINE_COMPONENT_KINDS,
  annotationVisualDefaults,
  annotationVisualPalette,
  formatAnnotationRgbCss,
  formatAnnotationRgbaCss,
  getAnnotationLineComponentCssColor,
  getAnnotationLineComponentLabelAccentCssColor,
  getAnnotationMeasurementTextCssColor,
  getAnnotationSelectionCssColor,
  getAnnotationShortLabelBackgroundCssColor,
  getAnnotationShortLabelBackgroundRgb255,
  getAnnotationSurfaceAccentCssColor,
  getAnnotationSurfaceStrokeCssColor,
  getAnnotationTextCssColor,
} from "./lib/utils/annotation-visual-tokens";
export type {
  AnnotationLineComponentKind,
  AnnotationTextTone,
} from "./lib/utils/annotation-visual-tokens";
export { annotationTypographyTokens } from "./lib/utils/annotation-typography-tokens";
export {
  annotationGeometryDefaults,
  hasSignificantVerticalOffsetMeters,
} from "./lib/utils/annotation-geometry-defaults";
export {
  ANNOTATION_SHORT_LABEL_COUNTER_STYLES,
  DEFAULT_ANNOTATION_SHORT_LABEL_CONFIG,
  formatMeasurementShortLabelToken,
} from "./lib/utils/annotation-badge-tokens";
export type {
  AnnotationShortLabelConfigMap,
  AnnotationShortLabelCounterStyle,
} from "./lib/utils/annotation-badge-tokens";
export {
  getAnnotationFlyToPointsById,
  getLastCustomPointAnnotationName,
  getMeasurementEntryFlyToPoints,
  getPointById,
  getPointPositionMap,
} from "./lib/utils/annotation-collection";
export { buildAnnotationGeoJsonFeatureCollection } from "./lib/utils/annotation-geo-json-export";
export {
  ANNOTATION_COMMON_SHORTCUT_ACTIONS,
  ANNOTATION_NAVIGATION_SHORTCUT_ACTIONS,
  isManagedAnnotationKeyboardEvent,
  isSelectAllAnnotationKeyboardShortcut,
  renderAnnotationShortcutGlyph,
  resolveAnnotationCommonShortcutAction,
  resolveAnnotationNavigationShortcutAction,
} from "./lib/utils/annotation-keyboard-shortcuts";
export type { AnnotationNavigationShortcutAction } from "./lib/utils/annotation-keyboard-shortcuts";
export {
  applyDesiredPointLabelAnchors,
  applyLabelAppearance,
  buildDesiredPointLabelAnchorById,
  buildPolylinePointLabelTextByPointId,
  buildStandaloneDistancePointSets,
  collectCollapsedPillPointIds,
  collectLabelAnchorPointIdsWithForcedVisibility,
  collectPointIdsWithoutSelfLabelAnchor,
  getNextPointLabelMetricMode,
  normalizeLabelAppearance,
} from "./lib/utils/annotation-label";
export { getCustomPointAnnotationName } from "./lib/utils/annotation-naming";
export {
  areDistanceRelationsEquivalent,
  arePolygonAnnotationsEquivalent,
} from "./lib/utils/annotation-state-equality";
export {
  listAnnotationToolShortcuts,
  resolveAnnotationToolShortcutTarget,
} from "./lib/utils/annotation-tool-shortcuts";
export { buildEdgeRelationRenderContext } from "./lib/utils/build-edge-relation-render-context";
export {
  hasPointCandidateOffsetStem,
  resolveCandidateCapabilities,
} from "./lib/utils/candidate-capabilities";
export {
  getAveragedCandidateRingNormal,
  pushCandidateRingSample,
} from "./lib/utils/candidate-ring-normal-smoothing";
export type { CandidateRingSample } from "./lib/utils/candidate-ring-normal-smoothing";
export { buildDerivedPolylinePaths } from "./lib/utils/derived-polyline-paths";
export { hasAnyVisibleDistanceRelationLine } from "./lib/utils/distance-relation-display";
export {
  distanceVisualizationDefaults,
  resolveDistanceRelation,
} from "./lib/utils/distance-visualization";
export type { ResolvedDistanceRelation } from "./lib/utils/distance-visualization";
export { isKeyboardTargetEditable } from "./lib/utils/dom";
export {
  buildGeometryEdgeTable,
  buildPolygonGroupVertexTable,
  getDistanceRelationId,
  getMeasurementEdgeId,
  withDistanceRelationEdgeId,
} from "./lib/utils/measurement-relations";
export {
  buildOrderByIdFromEntryOrder,
  compareOrderedEntries,
} from "./lib/utils/order-by-id";
export {
  buildEdgeRelationIdsForPolygon,
  computePolygonGroupDerivedData,
  computePolylinePlanarAngleSumDeg,
  createPlaneFromThreePoints,
  distancePointToPlane,
  orientPlaneNormalTowardPosition,
  projectPointOntoPlane,
} from "./lib/utils/planar-geometry";
export { getConnectedOpenPolylineGroupIds } from "./lib/utils/planar-measurement-groups";
export { buildPointGeometryRows } from "./lib/utils/point-geometry-persistence";
export {
  buildScreenRectangle,
  getScreenRectangleSize,
  selectPointIdsInScreenRectangle,
} from "./lib/utils/screen-rectangle";
export { isPointInViewport } from "./lib/utils/screen-viewport";
export {
  applyDeltaToSelectedPoints,
  computeMoveDelta,
  getSelectedPointIds,
  hasReferencePointInSelection,
  shouldMoveSelectionAsGroup,
} from "./lib/utils/selection-group-move";
export {
  buildVerticalAutoCloseRectangle,
  buildVerticalRectangleCornerFromDiagonal,
  getVerticalPolygonAxisRotationSuffix,
  getVerticalRectanglePreviewAreaSquareMeters,
} from "./lib/visualization/vertical-rectangle-geometry";
