export {
  buildDistanceTriangleInsidePoint2D,
  buildOutsideReferencePoint2D,
  buildVerticalDistanceLineScreenData,
  buildVerticalLabelReferencePoint2D,
  computePolygonCentroid2D,
  hasVisibleDistanceRelationComponentLines,
  isDistanceRelationHorizontalLineVisible,
  isDistanceRelationVerticalLineVisible,
  normalizeLabelAngleDeg,
} from "./lib/distance-screen-space";
export type { DistanceScreenTriangle } from "./lib/distance-screen-space";
export { ANNOTATION_CANDIDATE_KINDS } from "./lib/types/annotation-candidate";
export type {
  AnnotationCandidateDescriptor,
  AnnotationCandidateKind,
} from "./lib/types/annotation-candidate";
export {
  isDistancePointEntry,
  isPointAnnotationEntry,
  isPointMeasurementEntry,
} from "./lib/types/annotation-cesium-types";
export type {
  AnnotationCollection,
  AnnotationEntry,
  AnnotationMode,
  AnnotationPersistenceEnvelope,
  AnnotationPointEntry,
  DistancePointEntry,
  PointAnnotationEntry,
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
  AnnotationShortLabelKind,
  AnnotationToolType,
  AnnotationType,
  NodeChainAnnotation,
  PlanarPolygonPlane,
  PolygonAreaType,
} from "./lib/types/annotation-types";
export type { DerivedPolylinePath } from "./lib/types/derived-polyline-path";
export type { PointDistanceRelation } from "./lib/types/distance-relation";
export type { DistanceRelationRenderContext } from "./lib/types/distance-relation-render-context";
export {
  DEFAULT_LINEAR_SEGMENT_LINE_MODE,
  LINEAR_SEGMENT_LINE_MODES,
} from "./lib/types/linear-segment";
export type { LinearSegmentLineMode } from "./lib/types/linear-segment";
export { fromAlphabeticSequence } from "./lib/utils/alphabetic-sequence";
export {
  DEFAULT_ANNOTATION_SHORT_LABEL_CONFIG,
  formatMeasurementShortLabelToken,
} from "./lib/utils/annotation-badge-tokens";
export type { AnnotationShortLabelConfigMap } from "./lib/utils/annotation-badge-tokens";
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
  getAveragedPreviewRingNormal,
  pushCandidateRingSample,
  pushPreviewRingSample,
} from "./lib/utils/candidate-ring-normal-smoothing";
export type {
  CandidateRingSample,
  PreviewRingSample,
} from "./lib/utils/candidate-ring-normal-smoothing";
export { buildDerivedPolylinePaths } from "./lib/utils/derived-polyline-paths";
export { hasAnyVisibleDistanceRelationLine } from "./lib/utils/distance-relation-display";
export {
  REFERENCE_LINE_EPSILON_METERS,
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
export {
  buildActivePointCreateConfig,
  PURE_LABEL_DEFAULTS,
} from "./lib/utils/point-create-config";
export type { ActivePointCreateConfig } from "./lib/utils/point-create-config";
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
export { getUniqueIds } from "./lib/utils/selection-set";
export { syncNodeChainEdgeDistanceRelations } from "./lib/utils/sync-node-chain-edge-distance-relations";
export {
  buildGroundAreaLabelText,
  buildPlanarAreaLabelText,
  buildVerticalAreaLabelText,
} from "./lib/visualization/area-labels/area-label-text-builders";
export type { AreaLabelText } from "./lib/visualization/area-labels/area-label-text-builders";
export {
  buildDistanceRelationEdgeLabelOverlays,
  getNextDirectLineLabelMode,
} from "./lib/visualization/distance/distance-relation-label-display";
export type {
  DirectLineLabelMode,
  DistanceRelationLabelVisibilityByKind,
  ReferenceLineLabelKind,
} from "./lib/visualization/distance/distance-relation-label.types";
export {
  buildGroundPolygonPreviewGroups,
  buildPlanarPolygonPreviewGroups,
  buildVerticalPolygonPreviewGroups,
} from "./lib/visualization/polygon-preview-groups";
export {
  buildPolylinePreviewCornerMarkers,
  buildPolylinePreviewEdgeSegments,
  buildPolylinePreviewMeasurements,
} from "./lib/visualization/polyline-preview-geometry";
export { POLYGON_PREVIEW_STYLE } from "./lib/visualization/preview-geometry.types";
export type {
  CandidateConnectionPreview,
  PolygonPreviewGroup,
  PolylinePreviewMeasurement,
} from "./lib/visualization/preview-geometry.types";
export {
  buildVerticalAutoCloseRectangle,
  buildVerticalRectangleCornerFromDiagonal,
  getVerticalPolygonAxisRotationSuffix,
  getVerticalRectanglePreviewAreaSquareMeters,
} from "./lib/visualization/vertical-rectangle-geometry";
