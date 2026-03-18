import { createSlice } from "@reduxjs/toolkit";
import type { RootState } from "..";

export interface ArbeitsauftragTileFeature {
  id: number;
  nummer: string;
  team: string;
  angelegt_am: string;
  angelegt_von: string;
  total_protokolle: number;
  pct_offen: number;
  pct_in_bearbeitung: number;
  pct_erledigt: number;
  pct_fehlmeldung: number;
  geometry?: GeoJSON.Geometry;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ArbeitsauftragDetail = Record<string, any>;

interface ArbeitsauftraegeState {
  features: ArbeitsauftragTileFeature[];
  selectedAAId: number | null;
  selectedAAData: ArbeitsauftragDetail | null;
  loading: boolean;
  error: string | null;
}

const initialState: ArbeitsauftraegeState = {
  features: [],
  selectedAAId: null,
  selectedAAData: null,
  loading: false,
  error: null,
};

const slice = createSlice({
  name: "arbeitsauftraege",
  initialState,
  reducers: {
    setFeatures(state, action) {
      state.features = action.payload;
    },
    setSelectedAAId(state, action) {
      state.selectedAAId = action.payload;
    },
    setSelectedAAData(state, action) {
      state.selectedAAData = action.payload;
    },
    setLoading(state, action) {
      state.loading = action.payload;
    },
    setError(state, action) {
      state.error = action.payload;
    },
    clearSelection(state) {
      state.selectedAAId = null;
      state.selectedAAData = null;
      state.error = null;
    },
  },
});

export default slice;

export const {
  setFeatures,
  setSelectedAAId,
  setSelectedAAData,
  setLoading,
  setError,
  clearSelection,
} = slice.actions;

export const getAAFeatures = (state: RootState) =>
  state.arbeitsauftraege.features;
export const getSelectedAAId = (state: RootState) =>
  state.arbeitsauftraege.selectedAAId;
export const getSelectedAAData = (state: RootState) =>
  state.arbeitsauftraege.selectedAAData;
export const getAALoading = (state: RootState) =>
  state.arbeitsauftraege.loading;
export const getAAError = (state: RootState) => state.arbeitsauftraege.error;
