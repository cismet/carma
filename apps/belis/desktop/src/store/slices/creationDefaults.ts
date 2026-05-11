import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { RootState } from "../index";
import {
  removeDraft,
  setDraft,
  clearAllDrafts,
} from "./featuresForms";

// Per-feature-type allowlist of form fields to remember across new drafts.
// Add an entry here to opt a feature type into the "last values" memory.
export const CREATION_DEFAULTS_ALLOWLIST: Record<string, readonly string[]> = {
  leitung: ["fk_leitungstyp", "fk_material", "fk_querschnitt"],
};

interface CreationDefaultsState {
  // featureType -> last allowlisted values, sourced from the most recently
  // updated in-progress creation draft of that type.
  defaults: Record<string, Record<string, unknown>>;
  // featureId -> featureType for in-progress creation drafts. Used to clear
  // `defaults[type]` once the last draft of that type is removed.
  draftIdToType: Record<string, string>;
}

const initialState: CreationDefaultsState = {
  defaults: {},
  draftIdToType: {},
};

const pickAllowed = (
  featureType: string,
  values: Record<string, unknown>
): Record<string, unknown> | null => {
  const fields = CREATION_DEFAULTS_ALLOWLIST[featureType];
  if (!fields) return null;
  const picked: Record<string, unknown> = {};
  for (const f of fields) {
    if (values[f] !== undefined) picked[f] = values[f];
  }
  return Object.keys(picked).length > 0 ? picked : null;
};

const creationDefaultsSlice = createSlice({
  name: "creationDefaults",
  initialState,
  reducers: {
    clearDefaults(state, action: PayloadAction<string>) {
      delete state.defaults[action.payload];
    },
    clearAllDefaults(state) {
      state.defaults = {};
      state.draftIdToType = {};
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(setDraft, (state, action) => {
        const { featureId, featureType, values, isCreation, geometry } =
          action.payload;
        const isTracked = state.draftIdToType[featureId] != null;
        if (!isCreation && !isTracked) return;

        // featuresForms' reducer silently auto-deletes a creation draft when
        // the user clears every field and there's no geometry/files context;
        // no removeDraft is dispatched in that path. Mirror the cleanup so
        // our tracking doesn't leak.
        const allEmpty = Object.values(values).every(
          (v) => v === null || v === undefined || v === ""
        );
        if (isTracked && !isCreation && allEmpty && !geometry) {
          delete state.draftIdToType[featureId];
          const stillActive = Object.values(state.draftIdToType).includes(
            featureType
          );
          if (!stillActive) delete state.defaults[featureType];
          return;
        }

        // Always (re)record on creation — subsequent edits drop `isCreation`
        // from the payload, so the first call is our only chance to track it.
        if (isCreation) {
          state.draftIdToType[featureId] = featureType;
        }
        if (CREATION_DEFAULTS_ALLOWLIST[featureType] == null) return;
        const picked = pickAllowed(featureType, values);
        if (picked) {
          state.defaults[featureType] = picked;
        }
      })
      .addCase(removeDraft, (state, action) => {
        const featureId = action.payload;
        const featureType = state.draftIdToType[featureId];
        if (!featureType) return;
        delete state.draftIdToType[featureId];
        const stillActive = Object.values(state.draftIdToType).includes(
          featureType
        );
        if (!stillActive) {
          delete state.defaults[featureType];
        }
      })
      .addCase(clearAllDrafts, (state) => {
        state.defaults = {};
        state.draftIdToType = {};
      });
  },
});

export const { clearDefaults, clearAllDefaults } =
  creationDefaultsSlice.actions;

export default creationDefaultsSlice;

export const getCreationDefaults = (
  state: RootState,
  featureType: string
): Record<string, unknown> | undefined =>
  state.creationDefaults?.defaults[featureType];

export const getAllCreationDefaults = (
  state: RootState
): Record<string, Record<string, unknown>> =>
  state.creationDefaults?.defaults ?? {};
