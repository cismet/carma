import {
  AXIS_NUMERIC_EPSILON,
  getClosestAxisParamToRay,
  gizmoNormalize,
  type GizmoRay3,
  type GizmoVec3,
} from "./gizmoMath";

export type GizmoAxisDragConnectorState = {
  axisOrigin: GizmoVec3;
  axisDirection: GizmoVec3;
  axisParam: number;
  isDragging: boolean;
};

export type GizmoAxisDragUpdate = {
  axisParam: number;
  deltaFromDragStart: number;
  point: GizmoVec3;
  isDragging: boolean;
};

export type GizmoAxisDragConnectorOptions = {
  axisOrigin: GizmoVec3;
  axisDirection: GizmoVec3;
  initialAxisParam?: number;
  epsilon?: number;
  onAxisParamChange?: (update: GizmoAxisDragUpdate) => void;
  onDragStateChange?: (isDragging: boolean) => void;
};

export type GizmoAxisDragConnector = {
  setAxis: (axisOrigin: GizmoVec3, axisDirection: GizmoVec3) => void;
  setAxisParam: (axisParam: number) => void;
  getAxisParam: () => number;
  getPoint: () => GizmoVec3;
  getState: () => GizmoAxisDragConnectorState;
  projectRayToAxis: (ray: GizmoRay3) => number | null;
  beginDragFromRay: (ray: GizmoRay3) => boolean;
  updateDragFromRay: (ray: GizmoRay3) => number | null;
  endDrag: () => void;
};

const cloneVec3 = (v: GizmoVec3): GizmoVec3 => ({ x: v.x, y: v.y, z: v.z });

const addScaled = (
  origin: GizmoVec3,
  direction: GizmoVec3,
  scalar: number
) => ({
  x: origin.x + direction.x * scalar,
  y: origin.y + direction.y * scalar,
  z: origin.z + direction.z * scalar,
});

export const createAxisDragConnector = (
  options: GizmoAxisDragConnectorOptions
): GizmoAxisDragConnector => {
  const epsilon = options.epsilon ?? AXIS_NUMERIC_EPSILON;

  const state: GizmoAxisDragConnectorState = {
    axisOrigin: cloneVec3(options.axisOrigin),
    axisDirection:
      gizmoNormalize(options.axisDirection, epsilon) ??
      cloneVec3(options.axisDirection),
    axisParam: options.initialAxisParam ?? 0,
    isDragging: false,
  };

  let startAxisParam = 0;
  let baseAxisParam = state.axisParam;

  const emitAxisParam = (deltaFromDragStart: number) => {
    options.onAxisParamChange?.({
      axisParam: state.axisParam,
      deltaFromDragStart,
      point: addScaled(state.axisOrigin, state.axisDirection, state.axisParam),
      isDragging: state.isDragging,
    });
  };

  const setDragging = (isDragging: boolean) => {
    if (state.isDragging === isDragging) return;
    state.isDragging = isDragging;
    options.onDragStateChange?.(isDragging);
  };

  const projectRayToAxis = (ray: GizmoRay3): number | null => {
    const normalizedRayDirection = gizmoNormalize(ray.direction, epsilon);
    const normalizedAxisDirection = gizmoNormalize(
      state.axisDirection,
      epsilon
    );
    if (!normalizedRayDirection || !normalizedAxisDirection) return null;

    return getClosestAxisParamToRay(
      {
        origin: ray.origin,
        direction: normalizedRayDirection,
      },
      state.axisOrigin,
      normalizedAxisDirection,
      epsilon
    );
  };

  return {
    setAxis: (axisOrigin, axisDirection) => {
      state.axisOrigin = cloneVec3(axisOrigin);
      state.axisDirection =
        gizmoNormalize(axisDirection, epsilon) ?? cloneVec3(axisDirection);
    },

    setAxisParam: (axisParam) => {
      state.axisParam = axisParam;
      emitAxisParam(0);
    },

    getAxisParam: () => state.axisParam,

    getPoint: () =>
      addScaled(state.axisOrigin, state.axisDirection, state.axisParam),

    getState: () => ({
      axisOrigin: cloneVec3(state.axisOrigin),
      axisDirection: cloneVec3(state.axisDirection),
      axisParam: state.axisParam,
      isDragging: state.isDragging,
    }),

    projectRayToAxis,

    beginDragFromRay: (ray) => {
      const projected = projectRayToAxis(ray);
      if (projected === null) return false;

      startAxisParam = projected;
      baseAxisParam = state.axisParam;
      setDragging(true);
      emitAxisParam(0);
      return true;
    },

    updateDragFromRay: (ray) => {
      if (!state.isDragging) return null;

      const projected = projectRayToAxis(ray);
      if (projected === null) return null;

      const deltaFromDragStart = projected - startAxisParam;
      state.axisParam = baseAxisParam + deltaFromDragStart;
      emitAxisParam(deltaFromDragStart);
      return state.axisParam;
    },

    endDrag: () => {
      setDragging(false);
      emitAxisParam(0);
    },
  };
};

export default createAxisDragConnector;
