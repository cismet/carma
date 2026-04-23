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

export interface LassoSelectedFeature {
  id: string | number | undefined;
  source: string;
  sourceLayer: string | undefined;
  properties: Record<string, unknown>;
  geometry: GeoJSON.Geometry;
}

type AATabKey = "aa" | "ap";

type ApOpenedFrom = "sidebar" | "auTable" | null;

export interface ProtokolleSort {
  field: string;
  order: "ascend" | "descend";
}

interface ArbeitsauftraegeState {
  features: ArbeitsauftragTileFeature[];
  selectedAAId: number | null;
  selectedAAData: ArbeitsauftragDetail | null;
  selectedTeamId: number | null;
  previousTeamId: number | null;
  searchActive: boolean;
  activeAATab: AATabKey;
  selectedAPId: number | null;
  apOpenedFrom: ApOpenedFrom;
  loading: boolean;
  error: string | null;
  graphqlLoading: boolean;
  graphqlError: string | null;
  draftMode: boolean;
  lassoSelectedFeatures: LassoSelectedFeature[];
  protokolleSort: ProtokolleSort | null;
  searchResultsVersion: number;
}

const initialState: ArbeitsauftraegeState = {
  features: [],
  selectedAAId: null,
  selectedAAData: null,
  selectedTeamId: null,
  previousTeamId: null,
  searchActive: false,
  activeAATab: "aa",
  selectedAPId: null,
  apOpenedFrom: null,
  loading: false,
  error: null,
  graphqlLoading: false,
  graphqlError: null,
  draftMode: false,
  lassoSelectedFeatures: [],
  protokolleSort: null,
  searchResultsVersion: 0,
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
      state.apOpenedFrom = null;
    },
    setSelectedAAData(state, action) {
      state.selectedAAData = action.payload;
    },
    setLoading(state, action) {
      state.loading = action.payload;
    },
    setSelectedTeamId(state, action) {
      state.selectedTeamId = action.payload;
      // Only clear searchActive when user explicitly picks a team
      if (action.payload != null) {
        state.searchActive = false;
      }
    },
    setSearchActive(state, action: { payload: boolean }) {
      state.searchActive = action.payload;
    },
    setActiveAATab(state, action: { payload: AATabKey }) {
      state.activeAATab = action.payload;
      if (action.payload === "aa") state.apOpenedFrom = null;
    },
    setSelectedAPId(state, action: { payload: number | null }) {
      state.selectedAPId = action.payload;
    },
    setApOpenedFrom(state, action: { payload: ApOpenedFrom }) {
      state.apOpenedFrom = action.payload;
    },
    setError(state, action) {
      state.error = action.payload;
    },
    setGraphqlLoading(state, action: { payload: boolean }) {
      state.graphqlLoading = action.payload;
    },
    setGraphqlError(state, action: { payload: string | null }) {
      state.graphqlError = action.payload;
    },
    clearSelection(state) {
      state.selectedAAId = null;
      state.selectedAAData = null;
      state.activeAATab = "aa";
      state.selectedAPId = null;
      state.apOpenedFrom = null;
      state.error = null;
    },
    setDraftMode(state, action: { payload: boolean }) {
      if (action.payload && !state.draftMode) {
        // Entering draft mode: save current team, clear filter
        state.previousTeamId = state.selectedTeamId;
        state.selectedTeamId = null;
      } else if (!action.payload && state.draftMode) {
        // Leaving draft mode: restore saved team if user hasn't manually changed it
        if (state.selectedTeamId == null) {
          state.selectedTeamId = state.previousTeamId;
        }
        state.previousTeamId = null;
      }
      state.draftMode = action.payload;
    },
    setPreviousTeamId(state, action: { payload: number | null }) {
      state.previousTeamId = action.payload;
    },
    setLassoSelectedFeatures(
      state,
      action: { payload: LassoSelectedFeature[] }
    ) {
      state.lassoSelectedFeatures = action.payload;
    },
    clearLassoSelectedFeatures(state) {
      state.lassoSelectedFeatures = [];
    },
    setProtokolleSort(state, action: { payload: ProtokolleSort | null }) {
      state.protokolleSort = action.payload;
    },
    bumpSearchResultsVersion(state) {
      state.searchResultsVersion += 1;
    },
  },
});

export default slice;

export const {
  setFeatures,
  setSelectedAAId,
  setSelectedAAData,
  setSelectedTeamId,
  setSearchActive,
  setActiveAATab,
  setSelectedAPId,
  setApOpenedFrom,
  setLoading,
  setError,
  setGraphqlLoading,
  setGraphqlError,
  clearSelection,
  setDraftMode,
  setPreviousTeamId,
  setLassoSelectedFeatures,
  clearLassoSelectedFeatures,
  setProtokolleSort,
  bumpSearchResultsVersion,
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
export const getApOpenedFrom = (state: RootState) =>
  state.arbeitsauftraege.apOpenedFrom;
export const getGraphqlLoading = (state: RootState) =>
  state.arbeitsauftraege.graphqlLoading;
export const getGraphqlError = (state: RootState) =>
  state.arbeitsauftraege.graphqlError;
export const getSearchActive = (state: RootState) =>
  state.arbeitsauftraege.searchActive;
export const getDraftMode = (state: RootState) =>
  state.arbeitsauftraege.draftMode;
export const getPreviousTeamId = (state: RootState) =>
  state.arbeitsauftraege.previousTeamId;
export const getLassoSelectedFeatures = (state: RootState) =>
  state.arbeitsauftraege.lassoSelectedFeatures;
export const getProtokolleSort = (state: RootState) =>
  state.arbeitsauftraege.protokolleSort;
export const getSearchResultsVersion = (state: RootState) =>
  state.arbeitsauftraege.searchResultsVersion;
