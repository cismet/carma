import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  shapes: [],
  visibleShapes: [],
  activeShape: null,
  showAllMeasurements: false,
  deleteMeasurements: false,
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
