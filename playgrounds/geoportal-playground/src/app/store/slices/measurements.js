import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  shapes: [],
  visibleShapes: [],
  activeShape: null,
  drawingShape: false,
  drawingShapeDistance: 0,
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
    setDrawingShapeDistance(state, action) {
      state.drawingShapeDistance = action.payload;
    },
  },
});

export default slice;

export const {
  setShapes,
  setActiveShape,
  setVisibleShapes,
  setDrawingShape,
  setDrawingShapeDistance,
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
export const getDrawingShapesetDistance = (state) => {
  return state.measurements.drawingShapeDistance;
};
