import { Ray, Vector3 } from "three";

import { getClosestLineParamToRay } from "@carma-commons/math";

import { AXIS_NUMERIC_EPSILON } from "./constants";
export type GizmoAxisDragConnectorState = {
  axisOrigin: Vector3;
  axisDirection: Vector3;
  axisParam: number;
  isDragging: boolean;
};

export type GizmoAxisDragUpdate = {
  axisParam: number;
  deltaFromDragStart: number;
  point: Vector3;
  isDragging: boolean;
};

export type GizmoAxisDragConnectorOptions = {
  axisOrigin: Vector3;
  axisDirection: Vector3;
  initialAxisParam?: number;
  epsilon?: number;
  onAxisParamChange?: (update: GizmoAxisDragUpdate) => void;
  onDragStateChange?: (isDragging: boolean) => void;
};

export type GizmoAxisDragConnector = {
  setAxis: (axisOrigin: Vector3, axisDirection: Vector3) => void;
  setAxisParam: (axisParam: number) => void;
  getAxisParam: () => number;
  getPoint: () => Vector3;
  getState: () => GizmoAxisDragConnectorState;
  projectRayToAxis: (ray: Ray) => number | null;
  beginDragFromRay: (ray: Ray) => boolean;
  updateDragFromRay: (ray: Ray) => number | null;
  endDrag: () => void;
};

export const createAxisDragConnector = (
  options: GizmoAxisDragConnectorOptions
): GizmoAxisDragConnector => {
  const epsilon = options.epsilon ?? AXIS_NUMERIC_EPSILON;

  const state: GizmoAxisDragConnectorState = {
    axisOrigin: options.axisOrigin.clone(),
    axisDirection:
      options.axisDirection.lengthSq() > epsilon
        ? options.axisDirection.clone().normalize()
        : options.axisDirection.clone(),
    axisParam: options.initialAxisParam ?? 0,
    isDragging: false,
  };

  let startAxisParam = 0;
  let baseAxisParam = state.axisParam;

  const emitAxisParam = (deltaFromDragStart: number) => {
    options.onAxisParamChange?.({
      axisParam: state.axisParam,
      deltaFromDragStart,
      point: state.axisOrigin
        .clone()
        .add(state.axisDirection.clone().multiplyScalar(state.axisParam)),
      isDragging: state.isDragging,
    });
  };

  const setDragging = (isDragging: boolean) => {
    if (state.isDragging === isDragging) return;
    state.isDragging = isDragging;
    options.onDragStateChange?.(isDragging);
  };

  const projectRayToAxis = (ray: Ray): number | null => {
    if (
      ray.direction.lengthSq() <= epsilon ||
      state.axisDirection.lengthSq() <= epsilon
    ) {
      return null;
    }

    return getClosestLineParamToRay(
      new Ray(ray.origin.clone(), ray.direction.clone().normalize()),
      state.axisOrigin,
      state.axisDirection.clone().normalize(),
      epsilon
    );
  };

  return {
    setAxis: (axisOrigin, axisDirection) => {
      state.axisOrigin = axisOrigin.clone();
      state.axisDirection =
        axisDirection.lengthSq() > epsilon
          ? axisDirection.clone().normalize()
          : axisDirection.clone();
    },

    setAxisParam: (axisParam) => {
      state.axisParam = axisParam;
      emitAxisParam(0);
    },

    getAxisParam: () => state.axisParam,

    getPoint: () =>
      state.axisOrigin
        .clone()
        .add(state.axisDirection.clone().multiplyScalar(state.axisParam)),

    getState: () => ({
      axisOrigin: state.axisOrigin.clone(),
      axisDirection: state.axisDirection.clone(),
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
