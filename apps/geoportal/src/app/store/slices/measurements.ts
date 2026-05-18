import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import { Item } from "@carma-mapping/layers";
import type { DrawMode } from "@carma-mapping/measurements";

import type { RootState } from "..";

export type LibreDrawMode = DrawMode;

export type MeasurementsState = {
  measurements: Item[];
  libreDrawMode: LibreDrawMode;
};

const initialState: MeasurementsState = {
  measurements: [],
  libreDrawMode: "line",
};

const slice = createSlice({
  name: "measurements",
  initialState,
  reducers: {
    addMeasurement(state, action: PayloadAction<Item>) {
      const alreadyExists = state.measurements.some(
        (measurement) => measurement.id === action.payload.id
      );
      if (!alreadyExists) {
        state.measurements = [...state.measurements, action.payload];
      }
      return state;
    },
    removeMeasurement(state, action: PayloadAction<Item>) {
      state.measurements = state.measurements.filter(
        (measurement) => measurement.id !== action.payload.id
      );
      return state;
    },
    updateMeasurement(state, action: PayloadAction<Item>) {
      state.measurements = state.measurements.map((measurement) =>
        measurement.id === action.payload.id ? action.payload : measurement
      );
      return state;
    },
    setLibreDrawMode(state, action: PayloadAction<LibreDrawMode>) {
      state.libreDrawMode = action.payload;
    },
  },
});

export const {
  addMeasurement,
  removeMeasurement,
  updateMeasurement,
  setLibreDrawMode,
} = slice.actions;

export const getMeasurements = (state: RootState): Item[] =>
  state.measurements.measurements;

export const getLibreDrawMode = (state: RootState): LibreDrawMode =>
  state.measurements.libreDrawMode;

export default slice.reducer;
