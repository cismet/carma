import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { RootState } from "../index";

interface Draft {
  featureType: string;
  values: Record<string, unknown>;
  updatedAt: number;
}

interface FeaturesFormsState {
  drafts: Record<string, Draft>;
  loading: Record<string, boolean>;
  errors: Record<string, string | null>;
}

const initialState: FeaturesFormsState = {
  drafts: {},
  loading: {},
  errors: {},
};

const featuresFormsSlice = createSlice({
  name: "featuresForms",
  initialState,
  reducers: {
    setDraft(
      state,
      action: PayloadAction<{
        featureId: string;
        featureType: string;
        values: Record<string, unknown>;
      }>
    ) {
      const { featureId, featureType, values } = action.payload;
      state.drafts[featureId] = {
        featureType,
        values,
        updatedAt: Date.now(),
      };
    },
    removeDraft(state, action: PayloadAction<string>) {
      delete state.drafts[action.payload];
    },
    clearAllDrafts(state) {
      state.drafts = {};
    },
    setFormLoading(
      state,
      action: PayloadAction<{ featureId: string; loading: boolean }>
    ) {
      const { featureId, loading } = action.payload;
      state.loading[featureId] = loading;
    },
    setFormError(
      state,
      action: PayloadAction<{ featureId: string; error: string | null }>
    ) {
      const { featureId, error } = action.payload;
      state.errors[featureId] = error;
    },
    clearFormError(state, action: PayloadAction<string>) {
      delete state.errors[action.payload];
    },
  },
});

export default featuresFormsSlice;

export const {
  setDraft,
  removeDraft,
  clearAllDrafts,
  setFormLoading,
  setFormError,
  clearFormError,
} = featuresFormsSlice.actions;

// Selectors
export const getDraft = (state: RootState, featureId: string | undefined) =>
  featureId ? state.featuresForms.drafts[featureId] : undefined;

export const hasDraft = (state: RootState, featureId: string | undefined) =>
  featureId ? featureId in state.featuresForms.drafts : false;

export const getAllDraftIds = (state: RootState) =>
  Object.keys(state.featuresForms.drafts);

export const getFormLoading = (
  state: RootState,
  featureId: string | undefined
) => (featureId ? state.featuresForms.loading[featureId] ?? false : false);

export const getFormError = (
  state: RootState,
  featureId: string | undefined
) => (featureId ? state.featuresForms.errors[featureId] ?? null : null);
