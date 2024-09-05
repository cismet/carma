import { createSlice } from "@reduxjs/toolkit";
import { RootState } from "..";

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

export default slice;

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

export const getShapes = (state: RootState) => {
  return state.measurements.shapes;
};
export const getActiveShapes = (state: RootState) => {
  return state.measurements.activeShape;
};
export const getVisibleShapes = (state: RootState) => {
  return state.measurements.visibleShapes;
};
export const getDrawingShape = (state: RootState) => {
  return state.measurements.drawingShape;
};
export const getShowAllMeasurements = (state: RootState) => {
  return state.measurements.showAllMeasurements;
};
export const getDeleteMeasurements = (state: RootState) => {
  return state.measurements.deleteMeasurements;
};
export const getMoveToShape = (state: RootState) => {
  return state.measurements.moveToShape;
};
export const getUpdateShapeToShape = (state: RootState) => {
  return state.measurements.updateShape;
};
export const getMapMovingEnd = (state: RootState) => {
  return state.measurements.mapMovingEnd;
};
export const getUpdateTitleStatus = (state: RootState) => {
  return state.measurements.updateTitleStatus;
};
export const getLastActiveShapeBeforeDrawing = (state: RootState) => {
  return state.measurements.lastActiveShapeBeforeDrawing;
};
export const getMeasurementMode = (state: RootState) => {
  return state.measurements.measurementMode;
};

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
