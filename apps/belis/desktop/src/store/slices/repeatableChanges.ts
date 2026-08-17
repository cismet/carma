import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { RootState } from "../index";

/**
 * "Wiederholfelder" — a per-feature-type clipboard of field values the user
 * wants to repeat onto other features of the same type.
 *
 * Distinct from `creationDefaults`, which seeds *new* features automatically
 * from the last draft. This one is explicit and manual: the user edits a
 * Datenblatt, presses copy to capture exactly the fields they changed, then
 * opens another feature of the same type and presses paste.
 *
 * Only fields with an open draft can be captured — once a Datenblatt is saved
 * its changed set is empty and copy has nothing to take. That is intended.
 *
 * The source feature is deliberately not tracked: re-applying to it is a no-op
 * because its fields already hold those values.
 */
export interface RepeatableChangeSet {
  /**
   * Draft-shaped, serialized values — e.g. `{ leuchte: { zaehler: 5 } }`.
   * Serialized (dayjs → tagged string) so it survives redux-persist, mirroring
   * how `featuresForms` stores draft values.
   */
  values: Record<string, unknown>;
  /** Flattened leaf paths carried by `values`, e.g. `["leuchte.zaehler"]`. */
  paths: string[];
}

interface RepeatableChangesState {
  // featureType -> the fields captured for it. One slot per type, replaced
  // wholesale on each copy: the newest capture is always the one pasted.
  byType: Record<string, RepeatableChangeSet>;
}

const initialState: RepeatableChangesState = {
  byType: {},
};

const repeatableChangesSlice = createSlice({
  name: "repeatableChanges",
  initialState,
  reducers: {
    setRepeatableChanges(
      state,
      action: PayloadAction<{
        featureType: string;
        values: Record<string, unknown>;
        paths: string[];
      }>
    ) {
      const { featureType, values, paths } = action.payload;
      // An empty capture clears the slot rather than storing `{}` — the paste
      // button keys off the stored count, and an empty set would leave a
      // badge reading 0 next to a button that does nothing.
      if (paths.length === 0) {
        delete state.byType[featureType];
        return;
      }
      state.byType[featureType] = { values, paths };
    },
    clearRepeatableChanges(state, action: PayloadAction<string | undefined>) {
      const featureType = action.payload;
      if (featureType) delete state.byType[featureType];
      else state.byType = {};
    },
  },
});

export const { setRepeatableChanges, clearRepeatableChanges } =
  repeatableChangesSlice.actions;

export default repeatableChangesSlice;

export const getRepeatableChanges = (
  state: RootState,
  featureType: string
): RepeatableChangeSet | undefined =>
  state.repeatableChanges?.byType[featureType];

const EMPTY_BY_TYPE: Record<string, RepeatableChangeSet> = {};

/** Every captured change set, keyed by feature type. Used by the batch paste,
 *  which has no single form — and therefore no single type — to key off. */
export const getAllRepeatableChanges = (
  state: RootState
): Record<string, RepeatableChangeSet> =>
  state.repeatableChanges?.byType ?? EMPTY_BY_TYPE;
