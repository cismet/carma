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

// Every Standort/Mast form field that carries over across new drafts. Shared
// by the standalone `standort` feature and the `mast` tab of a new `leuchte`
// (the Standort tab in LeuchteForm renders the same MastFormFields), so both
// flows remember and green-highlight the exact same set. Excludes
// `standortangabe` and `haus_nr`, which are location-specific.
const STANDORT_MAST_FIELDS = [
  "strassenschluessel_pk",
  "strassenschluessel_strasse",
  "fk_strassenschluessel",
  "fk_kennziffer",
  "lfd_nummer",
  "fk_stadtbezirk",
  "fk_mastart",
  "fk_masttyp",
  "fk_klassifizierung",
  "fk_unterhaltspflicht_mast",
  "inbetriebnahme_mast",
  "verrechnungseinheit",
  "mastanstrich",
  "anstrichfarbe",
  "montagefirma",
  "gruendung",
  "standsicherheitspruefung",
  "naechstes_pruefdatum",
  "verfahren",
  "elek_pruefung",
  "erdung",
  "monteur",
  "mastschutz",
  "revision",
  "anlagengruppe",
  "anbauten",
  "bemerkungen",
  "letzte_aenderung",
] as const;

export const CREATION_DEFAULTS_ALLOWLIST: Record<string, AllowlistEntry> = {
  leitung: ["fk_leitungstyp", "fk_material", "fk_querschnitt"],
  // Mauerlasche remembers every form field across new drafts.
  mauerlasche: [
    "fk_material",
    "strassenschluessel_pk",
    "strassenschluessel_strasse",
    "fk_strassenschluessel",
    "laufende_nummer",
    "erstellungsjahr",
    "pruefdatum",
    "bemerkung",
  ],
  // Schaltstelle is temporarily opted out of the "last values" memory:
  // no fields are remembered, preselected, or green-highlighted for it.
  // Restore by un-commenting the entry below.
  // schaltstelle: [
  //   "fk_bauart",
  //   "strassenschluessel_pk",
  //   "strassenschluessel_strasse",
  //   "fk_strassenschluessel",
  // ],
  leuchte: {
    // Remember every field on the Leuchte tab across new drafts.
    leuchte: [
      "strassenschluessel_pk",
      "strassenschluessel_strasse",
      "fk_strassenschluessel",
      "fk_kennziffer",
      "lfd_nummer",
      "leuchtennummer",
      "fk_leuchttyp",
      "inbetriebnahme_leuchte",
      "zaehler",
      "montagefirma_leuchte",
      "fk_energielieferant",
      "schaltstelle",
      "rundsteuerempfaenger",
      "einbaudatum",
      "fk_dk1",
      "anzahl_1dk",
      "anschlussleistung_1dk",
      "fk_dk2",
      "anzahl_2dk",
      "anschlussleistung_2dk",
      "fk_unterhaltspflicht_leuchte",
      "wechseldatum",
      "naechster_wechsel",
      "leuchtmittel",
      "lebensdauer",
      "sonderturnus",
      "vorschaltgeraet",
      "wechselvorschaltgeraet",
      "bemerkungen",
    ],
    // The Standort tab of a new Leuchte renders the same MastFormFields as the
    // standalone Standort feature — remember the identical field set so both
    // flows highlight and carry over consistently.
    mast: STANDORT_MAST_FIELDS,
  },
  // Standort remembers every form field across new drafts EXCEPT
  // `standortangabe` (Standortangabe) and `haus_nr` (Hausnummer), which are
  // location-specific and should not carry over.
  standort: STANDORT_MAST_FIELDS,
};

interface CreationDefaultsState {
  // featureType -> last allowlisted values, sourced from the most recently
  // updated in-progress creation draft of that type. This is the draft-to-draft
  // "chain" memory: editing one new draft seeds the next. Read by BOTH the
  // toolbar dropdown and the per-form "+" button.
  defaults: Record<string, Record<string, unknown>>;
  // featureType -> allowlisted values copied from an existing feature the user
  // selected in Fachobjekte. Kept separate from `defaults` so the toolbar
  // dropdown never inherits a Fachobjekt selection — only the per-form "+"
  // button reads this (#645).
  selectionDefaults: Record<string, Record<string, unknown>>;
  // featureId -> featureType for in-progress creation drafts. Used to clear
  // `defaults[type]` once the last draft of that type is removed.
  draftIdToType: Record<string, string>;
}

const initialState: CreationDefaultsState = {
  defaults: {},
  selectionDefaults: {},
  draftIdToType: {},
};

// A field the user left blank contributes nothing to the "last values"
// memory. Picking a blank value would clobber a non-empty value remembered
// from a *different* draft once `mergeDefaults` folds it in — and an empty
// DatePicker, unlike an untouched text input, reports `null` rather than
// `undefined`, so a plain `!== undefined` check is not enough.
const isEmptyValue = (v: unknown): boolean =>
  v === null || v === undefined || v === "";

const pickAllowed = (
  featureType: string,
  values: Record<string, unknown>
): Record<string, unknown> | null => {
  const config = CREATION_DEFAULTS_ALLOWLIST[featureType];
  if (!config) return null;

  if (Array.isArray(config)) {
    const picked: Record<string, unknown> = {};
    for (const f of config) {
      if (!isEmptyValue(values[f])) picked[f] = values[f];
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
      if (!isEmptyValue(src[f])) sub[f] = src[f];
    }
    if (Object.keys(sub).length > 0) picked[subKey] = sub;
  }
  return Object.keys(picked).length > 0 ? picked : null;
};

// Same allowlist filter the reducers apply, exposed for the per-form "+"
// button: when pressed inside an in-progress draft it seeds the new draft
// straight from that draft's on-screen values and must keep only the
// remembered fields (#645).
export const pickRememberedValues = pickAllowed;

const isMergeableObj = (v: unknown): v is Record<string, unknown> =>
  v != null && typeof v === "object" && !Array.isArray(v);

// Merge freshly recorded defaults into the existing ones at the field level.
// `pickAllowed` already drops fields the edited draft left untouched (they
// arrive as `undefined`), so merging — rather than replacing — means editing
// one field in a draft never wipes the last value remembered for a field the
// user filled in a *different* draft. Nested sub-objects (the leuchte
// `{ leuchte, mast }` shape) are merged one level deeper; a plain top-level
// spread would replace a whole sub-object wholesale.
const mergeDefaults = (
  existing: Record<string, unknown>,
  picked: Record<string, unknown>
): Record<string, unknown> => {
  const merged: Record<string, unknown> = { ...existing };
  for (const [key, val] of Object.entries(picked)) {
    const prev = merged[key];
    merged[key] =
      isMergeableObj(prev) && isMergeableObj(val) ? { ...prev, ...val } : val;
  }
  return merged;
};

const creationDefaultsSlice = createSlice({
  name: "creationDefaults",
  initialState,
  reducers: {
    clearDefaults(state, action: PayloadAction<string>) {
      // Wipe both memories for the type: the per-form "+" button seeds from
      // selectionDefaults (falling back to defaults), so the clear button next
      // to it must reset whichever store would feed the next new draft (#645).
      delete state.defaults[action.payload];
      delete state.selectionDefaults[action.payload];
    },
    clearAllDefaults(state) {
      state.defaults = {};
      state.selectionDefaults = {};
      state.draftIdToType = {};
    },
    // Record a (possibly partial) defaults update, merged into any existing
    // entry for the feature type. The `setDraft` listener below always reads
    // the primary slices (`leuchte`/`mast`), so it cannot see values typed on
    // an extra Leuchte tab — those live in `values.leuchten[]`. LeuchteForm
    // dispatches this with the last-edited tab's values so the next new
    // feature is seeded from the tab the user actually worked on.
    recordDefaults(
      state,
      action: PayloadAction<{
        featureType: string;
        values: Record<string, unknown>;
      }>
    ) {
      const { featureType, values } = action.payload;
      const picked = pickAllowed(featureType, values);
      if (!picked) return;
      const existing = state.defaults[featureType];
      state.defaults[featureType] = existing
        ? mergeDefaults(existing, picked)
        : picked;
    },
    // Seed the "+" button's memory from an existing feature selected in
    // Fachobjekte. Written into `selectionDefaults` — kept apart from the
    // draft-chain `defaults` so the toolbar dropdown never inherits it.
    // Replaces wholesale (no merge): the next new draft must mirror the
    // selected feature exactly, so a field it left blank stays blank — a
    // merge would let a stale value from an earlier selection leak through.
    recordSelectionDefaults(
      state,
      action: PayloadAction<{
        featureType: string;
        values: Record<string, unknown>;
      }>
    ) {
      const { featureType, values } = action.payload;
      state.selectionDefaults[featureType] =
        pickAllowed(featureType, values) ?? {};
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
        // Leuchte's defaults are owned exclusively by LeuchteForm's
        // `recordDefaults` dispatch. That path can see extra-tab edits
        // (values.leuchten[]) and — unlike this listener — tells a genuine
        // user edit apart from the programmatic Strassenschluessel/Kennziffer/
        // Laufende-Nr. syncs that also dispatch setDraft. Recording here too
        // would let such a sync, fired on a draft the user merely switched to,
        // clobber the shared memory with that draft's stale values.
        if (featureType === "leuchte") return;
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
        // Keep the remembered "last values" alive after the last draft of a
        // type is removed — removeDraft fires both on discard and on a
        // successful save, and a save should not wipe the memory that seeds
        // the next new feature (#645).
        // const stillActive = Object.values(state.draftIdToType).includes(
        //   featureType
        // );
        // if (!stillActive) {
        //   delete state.defaults[featureType];
        // }
      })
      .addCase(clearAllDrafts, (state) => {
        state.defaults = {};
        state.selectionDefaults = {};
        state.draftIdToType = {};
      });
  },
});

export const {
  clearDefaults,
  clearAllDefaults,
  recordDefaults,
  recordSelectionDefaults,
} = creationDefaultsSlice.actions;

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

// Per-type values copied from a feature selected in Fachobjekte. Only the
// per-form "+" button reads this; the toolbar dropdown deliberately does not.
export const getSelectionDefaults = (
  state: RootState,
  featureType: string
): Record<string, unknown> | undefined =>
  state.creationDefaults?.selectionDefaults[featureType];

export const getAllSelectionDefaults = (
  state: RootState
): Record<string, Record<string, unknown>> =>
  state.creationDefaults?.selectionDefaults ?? {};

// Leaf paths of fields that are remembered across creations for a given
// feature type — flattened from CREATION_DEFAULTS_ALLOWLIST. Used by the
// form to mark remembered-and-filled fields green.
export const getAllowlistedPaths = (featureType: string): Set<string> => {
  const config = CREATION_DEFAULTS_ALLOWLIST[featureType];
  if (!config) return new Set();
  if (Array.isArray(config)) return new Set(config);
  const paths = new Set<string>();
  for (const [subKey, fields] of Object.entries(config)) {
    for (const f of fields) paths.add(`${subKey}.${f}`);
  }
  return paths;
};
