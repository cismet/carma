import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { Feature } from "geojson";
import type { RootState } from "../index";

// In-memory only for now: a refresh wipes the slice. Persistence (and a
// sidebar UI to delete entries) is a deliberate follow-up — see the
// MeasurementHost wiring in BelisMapWrapper for how features land here.

interface MeasurementsState {
  features: Feature[];
  selectedId: string | null;
}

const initialState: MeasurementsState = {
  features: [],
  selectedId: null,
};

const measurementsSlice = createSlice({
  name: "measurements",
  initialState,
  reducers: {
    setMeasurements(state, action: PayloadAction<Feature[]>) {
      state.features = action.payload;
      // Drop a stale selection if the picked id no longer exists.
      if (
        state.selectedId !== null &&
        !action.payload.some((f) => f.id === state.selectedId)
      ) {
        state.selectedId = null;
      }
    },
    selectMeasurement(state, action: PayloadAction<string | null>) {
      state.selectedId = action.payload;
    },
    clearMeasurements(state) {
      state.features = [];
      state.selectedId = null;
    },
  },
});

export const { setMeasurements, selectMeasurement, clearMeasurements } =
  measurementsSlice.actions;

export default measurementsSlice;

export const getMeasurements = (state: RootState): Feature[] =>
  state.measurements.features;

export const getSelectedMeasurementId = (state: RootState): string | null =>
  state.measurements.selectedId;
