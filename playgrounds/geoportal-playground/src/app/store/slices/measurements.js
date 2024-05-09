import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  shapes: [],
};

const slice = createSlice({
  name: 'measurements',
  initialState,
  reducers: {
    setShapes(state, action) {
      state.shapes = action.payload;
    },
  },
});

export default slice;

export const { setShapes } = slice.actions;

export const getShapes = (state) => {
  return state.measurements.shapes;
};
