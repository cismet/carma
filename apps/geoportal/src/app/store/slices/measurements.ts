import { createSlice } from "@reduxjs/toolkit";

import type { RootState } from "..";

export enum MEASUREMENT_MODE {
  DEFAULT = "default",
  MEASUREMENT = "measurement",
}

export type MeasurementsState = {
  mode: MEASUREMENT_MODE;
  shapes: any[];
  activeShape: null | any;
  visibleShapes: any[];

  showAll: boolean;
  deleteAll: boolean;
  drawingShape: boolean;
  lastActiveShapeBeforeDrawing: null | any;
  moveToShape: null | any;
  updateShape: boolean;
  mapMovingEnd: boolean;
  updateTitleStatus: boolean;
};
const initialState: MeasurementsState = {
  mode: MEASUREMENT_MODE.DEFAULT,
  shapes: [],
  activeShape: null,
  visibleShapes: [],

  showAll: false,
  deleteAll: false,
  drawingShape: false,
  lastActiveShapeBeforeDrawing: null,
  moveToShape: null,
  updateShape: false,
  mapMovingEnd: false,
  updateTitleStatus: false,
};

const slice = createSlice({
  name: "measurements",
  initialState,
  reducers: {
    setMode(state, action) {
      state.mode = action.payload;
    },
    setShapes(state, action) {
      state.shapes = action.payload;
    },
    setActiveShape(state, action) {
      state.activeShape = action.payload;
    },
    setVisibleShapes(state, action) {
      state.visibleShapes = action.payload;
    },
    setDrawingShape(state, action) {
      state.drawingShape = action.payload;
    },
    setShowAll(state, action) {
      state.showAll = action.payload;
    },
    setDeleteAll(state, action) {
      state.deleteAll = action.payload;
    },
    setMoveToShape(state, action) {
      state.moveToShape = action.payload;
    },
    setUpdateShape(state, action) {
      state.updateShape = action.payload;
    },
    setMapMovingEnd(state, action) {
      state.mapMovingEnd = action.payload;
    },
    setUpdateTitleStatus(state, action) {
      state.updateTitleStatus = action.payload;
    },
    setLastActiveShapeBeforeDrawing(state, action) {
      state.lastActiveShapeBeforeDrawing = action.payload;
    },
  },
});

export const {
  setMode,
  setShapes,
  setActiveShape,
  setVisibleShapes,
  setDrawingShape,
  setShowAll,
  setDeleteAll,
  setMoveToShape,
  setUpdateShape,
  setMapMovingEnd,
  setUpdateTitleStatus,
  setLastActiveShapeBeforeDrawing,
} = slice.actions;

export const updateTitle = (shapeId, customTitle) => {
  return function (dispatch, getState) {
    const state = getState() as RootState;
    const shapeFromVisible = state.measurements.visibleShapes.filter(
      (s) => s.shapeId === shapeId,
    );

    const visible = state.measurements.visibleShapes.map((m) => {
      if (m.shapeId === shapeId) {
        return {
          ...shapeFromVisible[0],
          customTitle,
        };
      }
      return m;
    });

    const shapeFromAllShapes = state.measurements.shapes.filter(
      (s) => s.shapeId === shapeId,
    );

    const allMeasurements = state.measurements.shapes.map((m) => {
      if (m.shapeId === shapeId) {
        return {
          ...shapeFromAllShapes[0],
          customTitle,
        };
      }
      return m;
    });

    dispatch(setVisibleShapes(visible));
    dispatch(setShapes(allMeasurements));
    // dispatch(setUpdateTitleStatus(true));
  };
};

export const addShape = (layer) => {
  return function (dispatch, getState) {
    const state = getState();
    const allShapes = state.measurements.shapes;
    dispatch(setShapes([...allShapes, layer]));
  };
};
export const deleteShapeById = (shapeId) => {
  return function (dispatch, getState) {
    const state = getState();
    const allShapes = state.measurements.shapes;
    const clearShapesArr = allShapes.filter((s) => s.shapeId !== shapeId);

    dispatch(setShapes(clearShapesArr));
  };
};

export const deleteVisibleShapeById = (shapeId) => {
  return function (dispatch, getState) {
    const state = getState();
    const allVisibleShapes = state.measurements.visibleShapes;
    const cleaerShapesArr = allVisibleShapes.filter(
      (s) => s.shapeId !== shapeId,
    );

    dispatch(setVisibleShapes(cleaerShapesArr));
  };
};

export const updateShapeById = (
  shapeId,
  newCoordinates,
  newDistance,
  newSquare = null,
) => {
  return function (dispatch, getState) {
    const state = getState();
    dispatch(setUpdateShape(true));
    const allShapes = state.measurements.shapes;
    const cleaerShapesArr = allShapes.map((s) => {
      if (s.shapeId === shapeId) {
        return {
          ...s,
          coordinates: newCoordinates,
          distance: newDistance,
          area: newSquare,
        };
      } else {
        return s;
      }
    });

    dispatch(setShapes(cleaerShapesArr));
  };
};

export const setLastVisibleShapeActive = () => {
  return function (dispatch, getState) {
    const state = getState();
    const allShapes = state.measurements.shapes;
    const lastShapeId = allShapes[allShapes.length - 1]?.shapeId;
    if (lastShapeId) {
      dispatch(setActiveShape(lastShapeId));
    }
  };
};

export const setDrawingWithLastActiveShape = () => {
  return function (dispatch, getState) {
    const state = getState();
    const lastActiveShape = state.measurements.activeShape;
    if (lastActiveShape) {
      dispatch(setLastActiveShapeBeforeDrawing(lastActiveShape));
      dispatch(setDrawingShape(true));
    }
  };
};

export const setActiveShapeIfDrawCancelled = () => {
  return function (dispatch, getState) {
    const state = getState();
    const lastActiveShape = state.measurements.lastActiveShapeBeforeDrawing;
    const visibleShapesLength = state.measurements.visibleShapes.length;
    const visible = state.measurements.visibleShapes;
    if (
      lastActiveShape &&
      // visibleShapesLength > 1 &&
      visible[0]?.shapeId !== 55555
    ) {
      dispatch(setActiveShape(lastActiveShape));
      dispatch(setDrawingShape(false));
    } else {
      dispatch(setVisibleShapes([]));
    }
  };
};

export const toggleMeasurementMode = () => {
  return function (dispatch, getState) {
    const state = getState();
    const mode = state.measurements.mode;
    if (mode === MEASUREMENT_MODE.DEFAULT) {
      dispatch(setMode(MEASUREMENT_MODE.MEASUREMENT));
    } else {
      dispatch(setMode(MEASUREMENT_MODE.DEFAULT));
    }
  };
};

export const updateAreaOfDrawing = (newArea) => {
  return function (dispatch, getState) {
    const state = getState();
    const shape = state.measurements.visibleShapes.map((s) => {
      if (s.shapeId === 5555) {
        return {
          ...s,
          area: newArea,
        };
      }
      return s;
    });
    dispatch(setVisibleShapes(shape));
  };
};

export const getActiveShapes = (state: RootState) =>
  state.measurements.activeShape;
export const getDeleteAll = (state: RootState) => state.measurements.deleteAll;
export const getDrawingShape = (state: RootState) =>
  state.measurements.drawingShape;
export const getLastActiveShapeBeforeDrawing = (state: RootState) =>
  state.measurements.lastActiveShapeBeforeDrawing;
export const getMapMovingEnd = (state: RootState) =>
  state.measurements.mapMovingEnd;
export const getMode = (state: RootState) => state.measurements.mode;
export const getMoveToShape = (state: RootState) =>
  state.measurements.moveToShape;
export const getShowAll = (state: RootState) => state.measurements.showAll;
export const getShapes = (state: RootState) => state.measurements.shapes;
export const getUpdateShapeToShape = (state: RootState) =>
  state.measurements.updateShape;
export const getUpdateTitleStatus = (state: RootState) =>
  state.measurements.updateTitleStatus;
export const getVisibleShapes = (state: RootState) =>
  state.measurements.visibleShapes;

export default slice.reducer;
