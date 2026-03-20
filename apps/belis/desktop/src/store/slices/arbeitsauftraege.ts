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

type AATabKey = "aa" | "ap";

interface ArbeitsauftraegeState {
  features: ArbeitsauftragTileFeature[];
  selectedAAId: number | null;
  selectedAAData: ArbeitsauftragDetail | null;
  selectedTeamId: number | null;
  activeAATab: AATabKey;
  selectedAPId: number | null;
  loading: boolean;
  error: string | null;
}

const initialState: ArbeitsauftraegeState = {
  features: [],
  selectedAAId: null,
  selectedAAData: null,
  selectedTeamId: null,
  activeAATab: "aa",
  selectedAPId: null,
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
    setSelectedTeamId(state, action) {
      state.selectedTeamId = action.payload;
    },
    setActiveAATab(state, action: { payload: AATabKey }) {
      state.activeAATab = action.payload;
      if (action.payload === "aa") state.selectedAPId = null;
    },
    setSelectedAPId(state, action: { payload: number | null }) {
      state.selectedAPId = action.payload;
    },
    setError(state, action) {
      state.error = action.payload;
    },
    clearSelection(state) {
      state.selectedAAId = null;
      state.selectedAAData = null;
      state.activeAATab = "aa";
      state.selectedAPId = null;
      state.error = null;
    },
  },
});

export default slice;

export const {
  setFeatures,
  setSelectedAAId,
  setSelectedAAData,
  setSelectedTeamId,
  setActiveAATab,
  setSelectedAPId,
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
export const getSelectedTeamId = (state: RootState) =>
  state.arbeitsauftraege.selectedTeamId;
export const getActiveAATab = (state: RootState) =>
  state.arbeitsauftraege.activeAATab;
export const getSelectedAPId = (state: RootState) =>
  state.arbeitsauftraege.selectedAPId;
