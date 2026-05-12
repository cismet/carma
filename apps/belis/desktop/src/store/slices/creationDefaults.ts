import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { RootState } from "../index";
import {
  removeDraft,
  setDraft,
  clearAllDrafts,
} from "./featuresForms";

// Per-feature-type allowlist of form fields to remember across new drafts.
// Add an entry here to opt a feature type into the "last values" memory.
//
// Two shapes are supported:
//   - flat:   readonly string[]                              — picks fields directly from `values`
//   - nested: Record<subKey, readonly string[]>              — picks fields from `values[subKey]`
// Use the nested form when the draft state has tab-grouped sub-objects (e.g. Leuchte
// stores `{ leuchte: {...}, mast: {...} }` because Strassenschluessel lives on the Mast tab).
type AllowlistEntry = readonly string[] | Record<string, readonly string[]>;

export const CREATION_DEFAULTS_ALLOWLIST: Record<string, AllowlistEntry> = {
  leitung: ["fk_leitungstyp", "fk_material", "fk_querschnitt"],
  mauerlasche: [
    "fk_material",
    "strassenschluessel_pk",
    "strassenschluessel_strasse",
    "fk_strassenschluessel",
  ],
  schaltstelle: [
    "fk_bauart",
    "strassenschluessel_pk",
    "strassenschluessel_strasse",
    "fk_strassenschluessel",
  ],
  leuchte: {
    leuchte: [
      "fk_kennziffer",
      "leuchtennummer",
      "fk_leuchttyp",
      "inbetriebnahme_leuchte",
      "montagefirma_leuchte",
      "fk_energielieferant",
      "schaltstelle",
      "fk_dk1",
      "anzahl_1dk",
      "anschlussleistung_1dk",
      "fk_dk2",
      "anzahl_2dk",
      "fk_unterhaltspflicht_leuchte",
      "leuchtmittel",
      "lebensdauer",
    ],
    mast: [
      "strassenschluessel_pk",
      "strassenschluessel_strasse",
      "fk_strassenschluessel",
      "fk_kennziffer",
      "fk_stadtbezirk",
      "fk_mastart",
      "fk_masttyp",
      "fk_klassifizierung",
      "fk_unterhaltspflicht_mast",
      "inbetriebnahme_mast",
      "montagefirma",
      "standsicherheitspruefung",
      "verfahren",
      "anlagengruppe",
      "letzte_aenderung",
    ],
  },
  standort: [
    "strassenschluessel_pk",
    "strassenschluessel_strasse",
    "fk_strassenschluessel",
    "fk_kennziffer",
    "fk_stadtbezirk",
    "fk_mastart",
    "fk_masttyp",
    "fk_klassifizierung",
    "fk_unterhaltspflicht_mast",
    "inbetriebnahme_mast",
    "montagefirma",
    "standsicherheitspruefung",
    "verfahren",
    "anlagengruppe",
    "letzte_aenderung",
  ],
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
  const config = CREATION_DEFAULTS_ALLOWLIST[featureType];
  if (!config) return null;

  if (Array.isArray(config)) {
    const picked: Record<string, unknown> = {};
    for (const f of config) {
      if (values[f] !== undefined) picked[f] = values[f];
    }
    return Object.keys(picked).length > 0 ? picked : null;
  }

  // Nested: values is shaped { [subKey]: { ...fields } }. Descend per subKey
  // and only emit subKeys that had at least one matching field.
  const picked: Record<string, Record<string, unknown>> = {};
  for (const [subKey, fields] of Object.entries(config)) {
    const subValues = values[subKey];
    if (!subValues || typeof subValues !== "object" || Array.isArray(subValues))
      continue;
    const sub: Record<string, unknown> = {};
    const src = subValues as Record<string, unknown>;
    for (const f of fields) {
      if (src[f] !== undefined) sub[f] = src[f];
    }
    if (Object.keys(sub).length > 0) picked[subKey] = sub;
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
