import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  shapes: [],
  activeShape: null,
};

const slice = createSlice({
  name: 'measurements',
  initialState,
  reducers: {
    setShapes(state, action) {
      state.shapes = action.payload;
    },
    setActiveShape(state, action) {
      state.activeShape = action.payload;
    },
  },
});

export default slice;

export const { setShapes, setActiveShape } = slice.actions;

export const getShapes = (state) => {
  return state.measurements.shapes;
};
export const getActiveShapes = (state) => {
  return state.measurements.activeShape;
};
