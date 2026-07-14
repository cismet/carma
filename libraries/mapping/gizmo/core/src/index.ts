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
