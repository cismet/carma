import { Ray, Vector3 } from "three";

import {
  createAxisDragConnector,
  type GizmoAxisDragConnector,
} from "./axisDragConnector";
export type GizmoCssAxisSnapshot = {
  axisParam: number;
  isDragging: boolean;
  point: Vector3;
  gridTransform: string;
  lastRayDirection: Vector3 | null;
};

export type GizmoCssAxisControllerOptions = {
  axisOrigin: Vector3;
  axisDirection: Vector3;
  initialAxisParam?: number;
  pointerDepth?: number;
  rayOrigin?: Vector3;
  gridScale?: number;
  gridTiltDeg?: number;
  onChange?: (snapshot: GizmoCssAxisSnapshot) => void;
};

export type GizmoCssAxisController = {
  setAxis: (axisOrigin: Vector3, axisDirection: Vector3) => void;
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

const buildGridTransform = (
  point: Vector3,
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
  rayOrigin: Vector3
): { ray: Ray; direction: Vector3 } => {
  const ndcX = ((clientX - viewportRect.left) / viewportRect.width) * 2 - 1;
  const ndcY = ((clientY - viewportRect.top) / viewportRect.height) * 2 - 1;

  const direction = new Vector3(ndcX, -ndcY, -Math.max(0.25, pointerDepth));
  if (direction.lengthSq() > 1e-6) {
    direction.normalize();
  } else {
    direction.set(0, 0, -1);
  }

  return {
    ray: new Ray(rayOrigin.clone(), direction.clone()),
    direction,
  };
};

export const createCssAxisDragController = (
  options: GizmoCssAxisControllerOptions
): GizmoCssAxisController => {
  let pointerDepth = options.pointerDepth ?? 1.6;
  let rayOrigin = options.rayOrigin?.clone() ?? new Vector3(0, 0, 3);
  let gridScale = options.gridScale ?? 80;
  let gridTiltDeg = options.gridTiltDeg ?? 58;

  const connector: GizmoAxisDragConnector = createAxisDragConnector({
    axisOrigin: options.axisOrigin,
    axisDirection: options.axisDirection,
    initialAxisParam: options.initialAxisParam,
  });

  let lastRayDirection: Vector3 | null = null;

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
