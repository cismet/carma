import { createSlice } from "@reduxjs/toolkit";
import { useSelector } from "react-redux";

import type { RootState } from "..";

export type MeasurementsState = {
  shapes: any[];
  visibleShapes: any[];
  activeShape: null | any;
  showAllMeasurements: boolean;
  deleteMeasurements: boolean;
  drawingShape: boolean;
  lastActiveShapeBeforeDrawing: null | any;
  moveToShape: null | any;
  updateShape: boolean;
  mapMovingEnd: boolean;
  updateTitleStatus: boolean;
  measurementMode: string;
};
const initialState: MeasurementsState = {
  shapes: [],
  visibleShapes: [],
  activeShape: null,
  showAllMeasurements: false,
  deleteMeasurements: false,
  drawingShape: false,
  lastActiveShapeBeforeDrawing: null,
  moveToShape: null,
  updateShape: false,
  mapMovingEnd: false,
  updateTitleStatus: false,
  measurementMode: "default",
};

const slice = createSlice({
  name: "measurements",
  initialState,
  reducers: {
    setVisibleShapes(state, action) {
      state.visibleShapes = action.payload;
    },
    setShapes(state, action) {
      state.shapes = action.payload;
    },
    setActiveShape(state, action) {
      state.activeShape = action.payload;
    },
    setDrawingShape(state, action) {
      state.drawingShape = action.payload;
    },
    setShowAllMeasurements(state, action) {
      state.showAllMeasurements = action.payload;
    },
    setDeleteMeasurements(state, action) {
      state.deleteMeasurements = action.payload;
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
    setMeasurementMode(state, action) {
      state.measurementMode = action.payload;
    },
  },
});


export const {
  setShapes,
  setActiveShape,
  setVisibleShapes,
  setDrawingShape,
  setShowAllMeasurements,
  setDeleteMeasurements,
  setMoveToShape,
  setUpdateShape,
  setMapMovingEnd,
  setUpdateTitleStatus,
  setLastActiveShapeBeforeDrawing,
  setMeasurementMode,
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
    const cleaerShapesArr = allShapes.filter((s) => s.shapeId !== shapeId);

    dispatch(setShapes(cleaerShapesArr));
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
export const setActiveShapeIfDrawCanseld = () => {
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
    const mode = state.measurements.measurementMode;
    if (mode === "default") {
      dispatch(setMeasurementMode("measurement"));
    } else {
      dispatch(setMeasurementMode("default"));
    }
  };
};

export const updateAreaOfDrawingMeasurement = (newArea) => {
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

// Selectors (Private: Not Exported)

const getActiveShapes = (state: RootState) => state.measurements.activeShape;
const getDeleteMeasurements = (state: RootState) => state.measurements.deleteMeasurements;
const getDrawingShape = (state: RootState) => state.measurements.drawingShape;
const getLastActiveShapeBeforeDrawing = (state: RootState) => state.measurements.lastActiveShapeBeforeDrawing;
const getMapMovingEnd = (state: RootState) => state.measurements.mapMovingEnd;
const getMeasurementMode = (state: RootState) => state.measurements.measurementMode;
const getMoveToShape = (state: RootState) => state.measurements.moveToShape;
const getShowAllMeasurements = (state: RootState) => state.measurements.showAllMeasurements;
const getShapes = (state: RootState) => state.measurements.shapes;
const getUpdateShapeToShape = (state: RootState) => state.measurements.updateShape;
const getUpdateTitleStatus = (state: RootState) => state.measurements.updateTitleStatus;
const getVisibleShapes = (state: RootState) => state.measurements.visibleShapes;

// Hook Selectors (Exported with `useMeasurement` Prefix)

export const useMeasurementActiveShapes = () => useSelector(getActiveShapes);
export const useMeasurementDeleteMeasurements = () => useSelector(getDeleteMeasurements);
export const useMeasurementDrawingShape = () => useSelector(getDrawingShape);
export const useMeasurementLastActiveShapeBeforeDrawing = () => useSelector(getLastActiveShapeBeforeDrawing);
export const useMeasurementMapMovingEnd = () => useSelector(getMapMovingEnd);
export const useMeasurementMeasurementMode = () => useSelector(getMeasurementMode);
export const useMeasurementMoveToShape = () => useSelector(getMoveToShape);
export const useMeasurementShowAllMeasurements = () => useSelector(getShowAllMeasurements);
export const useMeasurementShapes = () => useSelector(getShapes);
export const useMeasurementUpdateShapeToShape = () => useSelector(getUpdateShapeToShape);
export const useMeasurementUpdateTitleStatus = () => useSelector(getUpdateTitleStatus);
export const useMeasurementVisibleShapes = () => useSelector(getVisibleShapes);

export default slice;
