import {
  createAxisDragConnector,
  type GizmoAxisDragConnector,
} from "./axisDragConnector";
import { gizmoNormalize, type GizmoRay3, type GizmoVec3 } from "./gizmoMath";

export type GizmoCssAxisSnapshot = {
  axisParam: number;
  isDragging: boolean;
  point: GizmoVec3;
  gridTransform: string;
  lastRayDirection: GizmoVec3 | null;
};

export type GizmoCssAxisControllerOptions = {
  axisOrigin: GizmoVec3;
  axisDirection: GizmoVec3;
  initialAxisParam?: number;
  pointerDepth?: number;
  rayOrigin?: GizmoVec3;
  gridScale?: number;
  gridTiltDeg?: number;
  onChange?: (snapshot: GizmoCssAxisSnapshot) => void;
};

export type GizmoCssAxisController = {
  setAxis: (axisOrigin: GizmoVec3, axisDirection: GizmoVec3) => void;
  setAxisParam: (axisParam: number) => void;
  setPointerDepth: (pointerDepth: number) => void;
  setGridStyle: (gridScale: number, gridTiltDeg: number) => void;
  beginDragFromClient: (
    clientX: number,
    clientY: number,
    viewportRect: DOMRect | ClientRect
  ) => boolean;
  updateDragFromClient: (
    clientX: number,
    clientY: number,
    viewportRect: DOMRect | ClientRect
  ) => number | null;
  endDrag: () => void;
  getSnapshot: () => GizmoCssAxisSnapshot;
};

const cloneVec3 = (v: GizmoVec3): GizmoVec3 => ({ x: v.x, y: v.y, z: v.z });

const buildGridTransform = (
  point: GizmoVec3,
  gridScale: number,
  gridTiltDeg: number
) => {
  const tx = point.x * gridScale;
  const ty = -point.y * gridScale;
  const rz = point.x * 16;
  const rx = gridTiltDeg + point.z * 16;
  return `perspective(900px) rotateX(${rx}deg) rotateZ(${rz}deg) translate3d(${tx}px, ${ty}px, 0)`;
};

const toPointerRay = (
  clientX: number,
  clientY: number,
  viewportRect: DOMRect | ClientRect,
  pointerDepth: number,
  rayOrigin: GizmoVec3
): { ray: GizmoRay3; direction: GizmoVec3 } => {
  const ndcX = ((clientX - viewportRect.left) / viewportRect.width) * 2 - 1;
  const ndcY = ((clientY - viewportRect.top) / viewportRect.height) * 2 - 1;

  const rawDirection: GizmoVec3 = {
    x: ndcX,
    y: -ndcY,
    z: -Math.max(0.25, pointerDepth),
  };

  const direction = gizmoNormalize(rawDirection) ?? { x: 0, y: 0, z: -1 };

  return {
    ray: {
      origin: rayOrigin,
      direction,
    },
    direction,
  };
};

export const createCssAxisDragController = (
  options: GizmoCssAxisControllerOptions
): GizmoCssAxisController => {
  let pointerDepth = options.pointerDepth ?? 1.6;
  let rayOrigin: GizmoVec3 = options.rayOrigin
    ? cloneVec3(options.rayOrigin)
    : { x: 0, y: 0, z: 3 };
  let gridScale = options.gridScale ?? 80;
  let gridTiltDeg = options.gridTiltDeg ?? 58;

  const connector: GizmoAxisDragConnector = createAxisDragConnector({
    axisOrigin: options.axisOrigin,
    axisDirection: options.axisDirection,
    initialAxisParam: options.initialAxisParam,
  });

  let lastRayDirection: GizmoVec3 | null = null;

  const getSnapshot = (): GizmoCssAxisSnapshot => {
    const state = connector.getState();
    const point = connector.getPoint();

    return {
      axisParam: state.axisParam,
      isDragging: state.isDragging,
      point,
      gridTransform: buildGridTransform(point, gridScale, gridTiltDeg),
      lastRayDirection,
    };
  };

  const emit = () => {
    options.onChange?.(getSnapshot());
  };

  return {
    setAxis: (axisOrigin, axisDirection) => {
      connector.setAxis(axisOrigin, axisDirection);
      emit();
    },

    setAxisParam: (axisParam) => {
      connector.setAxisParam(axisParam);
      emit();
    },

    setPointerDepth: (nextPointerDepth) => {
      pointerDepth = nextPointerDepth;
      emit();
    },

    setGridStyle: (nextGridScale, nextGridTiltDeg) => {
      gridScale = nextGridScale;
      gridTiltDeg = nextGridTiltDeg;
      emit();
    },

    beginDragFromClient: (clientX, clientY, viewportRect) => {
      const { ray, direction } = toPointerRay(
        clientX,
        clientY,
        viewportRect,
        pointerDepth,
        rayOrigin
      );
      lastRayDirection = direction;
      const started = connector.beginDragFromRay(ray);
      emit();
      return started;
    },

    updateDragFromClient: (clientX, clientY, viewportRect) => {
      const { ray, direction } = toPointerRay(
        clientX,
        clientY,
        viewportRect,
        pointerDepth,
        rayOrigin
      );
      lastRayDirection = direction;
      const axisParam = connector.updateDragFromRay(ray);
      emit();
      return axisParam;
    },

    endDrag: () => {
      connector.endDrag();
      emit();
    },

    getSnapshot,
  };
};

export default createCssAxisDragController;
