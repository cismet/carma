export { AXIS_NUMERIC_EPSILON } from "./lib/constants";
export {
  createAxisDragConnector,
  type GizmoAxisDragConnector,
  type GizmoAxisDragConnectorOptions,
  type GizmoAxisDragConnectorState,
  type GizmoAxisDragUpdate,
} from "./lib/axisDragConnector";
export {
  createCssAxisDragController,
  type GizmoCssAxisController,
  type GizmoCssAxisControllerOptions,
  type GizmoCssAxisSnapshot,
} from "./lib/cssAxisDragController";
export {
  createCssAxisGizmoView,
  type GizmoAxisId,
  type GizmoCssAxisView,
  type GizmoCssAxisViewOptions,
} from "./lib/cssAxisGizmoView";
export { CssAxisGizmoElement } from "./lib/cssAxisGizmoElement";
export {
  projectPointToSvg,
  toSvgPathD,
  toSvgPolylinePoints,
  transformPointWithMatrix,
  type CssViewMatrix4,
  type CssViewMatrixOrder,
  type ProjectPointToSvgOptions,
  type ReprojectionVec2,
  type ReprojectionVec3,
  type ReprojectionVec4,
  type SvgProjectedPoint,
  type TransformPointWithMatrixOptions,
} from "./lib/svgProjection";
export {
  createProjectedMoveGizmoView,
  type ProjectedMoveGizmoAxisCandidate,
  type ProjectedMoveGizmoView,
  type ProjectedMoveGizmoViewOptions,
} from "./lib/projectedMoveGizmoView";
export {
  beginPointerDragSession,
  POINTER_DRAG_SESSION_END_REASONS,
  type PointerDragSession,
  type PointerDragSessionEndReason,
  type PointerDragSessionOptions,
} from "./lib/pointer-drag-session";
export {
  ACTIVE_AXIS_ANCHOR_RADIUS_MULTIPLIER,
  ARROW_LAYER_Z_INDEX,
  ARROW_PERSPECTIVE_SCALE_MAX,
  ARROW_PERSPECTIVE_SCALE_MIN,
  AXIS_AND_DISC_OUTLINE_STROKE_WIDTH_PX,
  AXIS_LINE_LAYER_Z_INDEX,
  AXIS_SCREEN_SAMPLE_MAX_WORLD,
  AXIS_SCREEN_SAMPLE_MIN_WORLD,
  AXIS_SCREEN_SAMPLE_TARGET_PX,
  CENTER_DRAG_HIT_AREA_PX,
  CENTER_HIT_LAYER_Z_INDEX,
  DEFAULT_ACTIVE_ARROW_EDGE_PX,
  DEFAULT_INACTIVE_ARROW_EDGE_PX,
  DISC_LAYER_Z_INDEX,
  DISC_OUTLINE_BASE_OPACITY,
  DISC_OUTLINE_COLOR,
  DISC_PROJECTION_SCALE_SAMPLE_COUNT,
  DISC_SCREEN_PIXEL_RADIUS,
  DISC_SVG_EXTENT,
  DISC_SVG_HALF_EXTENT,
  ENU_EAST_AXIS_COLOR,
  ENU_NORTH_AXIS_COLOR,
  ENU_UP_AXIS_COLOR,
  INACTIVE_AXIS_ANCHOR_RADIUS_MULTIPLIER,
  INACTIVE_AXIS_OPACITY,
  MOVE_GIZMO_OVERLAY_Z_INDEX,
  OPEN_GIZMO_SCENE_CLICK_GUARD_MS,
  OVERLAY_HANDLE_ID,
  PLANE_DRAG_DISC_CURSOR,
  PLANE_DRAG_GROUND_SNAP_CURSOR,
  ROTATION_HANDLE_MIN_MINOR_RADIUS_PX,
  ROTATION_HANDLE_OFFSET_FROM_DISC_ZERO_RAD,
  ROTATION_HANDLE_RADIUS_PX,
  ROTATION_NORMAL_SCREEN_SAMPLE_WORLD,
  SECONDARY_AXIS_COLOR,
} from "./lib/point-move-gizmo-constants";
export {
  getDefaultAxisPresentation,
  getEnabledDefaultAxisPresentation,
  isDefaultAxisEnabled,
  type PointMoveGizmoDefaultAxisId,
} from "./lib/point-move-gizmo-default-axes";
export {
  getAxisArrowOffsetPx,
  getAxisUiLengthPx,
} from "./lib/point-move-gizmo-layout";
export {
  forwardWheelToCanvas,
  getPhysicalHairlinePx,
  restoreGlobalDragCursor,
  safeCall,
  safeDestroy,
  setGlobalDragCursor,
  updateTrianglePathAppearance,
  type GlobalDragCursorHolder,
} from "./lib/point-move-gizmo-dom";
export type {
  PointMoveGizmoAxisCandidate,
  PointMoveGizmoDragState,
  PointMoveGizmoLabels,
  PointMoveGizmoOptions,
  PointMoveGizmoPoint,
  PointMoveGizmoRotationDelta,
  PointMoveGizmoRotationFrame,
  PointMoveGizmoRotationState,
} from "./lib/point-move-gizmo.types";
