import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { Feature } from "geojson";
import {
  MEASUREMENT_FEATUREKIND,
  wrapMeasurement,
} from "@carma-mapping/measurements";
import type { AppDispatch, RootState } from "../index";
import { setSelectedFeature } from "./featureCollection";

// Persisted via redux-persist (localForage) — see measurementsConfig in
// store/index.ts. Features survive page refresh; MeasurementHost in
// BelisMapWrapper is the source that lands features here.

// Re-export the marker so existing imports from "store/slices/measurements"
// keep working until consumers are migrated to the shared library directly.
export { MEASUREMENT_FEATUREKIND };

interface MeasurementsState {
  features: Feature[];
}

const initialState: MeasurementsState = {
  features: [],
};

const measurementsSlice = createSlice({
  name: "measurements",
  initialState,
  reducers: {
    setMeasurements(state, action: PayloadAction<Feature[]>) {
      state.features = action.payload;
    },
    clearMeasurements(state) {
      state.features = [];
    },
  },
});

export const { setMeasurements, clearMeasurements } = measurementsSlice.actions;

export default measurementsSlice;

export const getMeasurements = (state: RootState): Feature[] =>
  state.measurements.features;

/** Select a measurement by id. Routes through the shared selectedFeature
 *  slot so any prior Fachobjekt selection is implicitly cleared (mutually
 *  exclusive selection — see featureCollection.setSelectedFeature). */
export const selectMeasurement =
  (id: string | null) =>
  (dispatch: AppDispatch, getState: () => RootState) => {
    if (id === null) {
      dispatch(setSelectedFeature(null));
      return;
    }
    const feature = getState().measurements.features.find((f) => f.id === id);
    if (!feature) return;
    dispatch(setSelectedFeature(wrapMeasurement(feature)));
  };

/** Replace the measurement set and keep the selectedFeature slot consistent:
 *  - drop the selection when the picked measurement is no longer present,
 *  - otherwise re-wrap the FRESH feature so consumers reading the selected
 *    slot (InfoBox subtitle, etc.) see post-edit geometry — the slot caches
 *    a feature snapshot at click time; without this, dragging the line
 *    updates the sidebar (which reads `measurements` live) but leaves the
 *    InfoBox stuck on the pre-drag length. */
export const replaceMeasurements =
  (features: Feature[]) =>
  (dispatch: AppDispatch, getState: () => RootState) => {
    const prevFeatures = getState().measurements.features;
    dispatch(setMeasurements(features));
    const selected: { featurekind?: string; id?: string | number } | null =
      getState().featureCollection.selectedFeature;
    if (!selected || selected.featurekind !== MEASUREMENT_FEATUREKIND) return;
    const fresh = features.find((f) => f.id === selected.id);
    if (!fresh) {
      // Selected measurement was removed — advance to the item that took
      // its slot (i.e. the previous "next" neighbour). Falls back to the
      // new last item when the deleted one was at the end.
      if (features.length === 0) {
        dispatch(setSelectedFeature(null));
        return;
      }
      const oldIdx = prevFeatures.findIndex((f) => f.id === selected.id);
      const nextIdx =
        oldIdx < 0
          ? 0
          : oldIdx < features.length
          ? oldIdx
          : features.length - 1;
      dispatch(setSelectedFeature(wrapMeasurement(features[nextIdx])));
      return;
    }
    dispatch(setSelectedFeature(wrapMeasurement(fresh)));
  };
