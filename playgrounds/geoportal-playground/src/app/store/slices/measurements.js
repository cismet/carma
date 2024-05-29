import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  shapes: [],
  visibleShapes: [],
  activeShape: null,
  showAllMeasurements: false,
  deleteMeasurements: false,
  drawingShape: false,
  moveToShape: null,
  updateShape: false,
  mapMovingEnd: false,
  updateTitleStatus: false,
};

const slice = createSlice({
  name: 'measurements',
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
} = slice.actions;

export const getShapes = (state) => {
  return state.measurements.shapes;
};
export const getActiveShapes = (state) => {
  return state.measurements.activeShape;
};
export const getVisibleShapes = (state) => {
  return state.measurements.visibleShapes;
};
export const getDrawingShape = (state) => {
  return state.measurements.drawingShape;
};
export const getShowAllMeasurements = (state) => {
  return state.measurements.showAllMeasurements;
};
export const getDeleteMeasurements = (state) => {
  return state.measurements.deleteMeasurements;
};
export const getMoveToShape = (state) => {
  return state.measurements.moveToShape;
};
export const getUpdateShapeToShape = (state) => {
  return state.measurements.updateShape;
};
export const getMapMovingEnd = (state) => {
  return state.measurements.mapMovingEnd;
};
export const getUpdateTitleStatus = (state) => {
  return state.measurements.updateTitleStatus;
};

export const updateTitle = (shapeId, customTitle) => {
  return function (dispatch, getState) {
    console.log('rrr customTitle', customTitle);
    console.log('rrr shapeId', shapeId);
    const state = getState();
    const shapeFromVisible = state.measurements.visibleShapes.filter(
      (s) => s.shapeId === shapeId
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
      (s) => s.shapeId === shapeId
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
