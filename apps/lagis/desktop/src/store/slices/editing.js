import { createSelector, createSlice } from "@reduxjs/toolkit";

// parcel: { schluesselId, label, key, urlParams }; draft/original: { admin }
const initialState = {
  active: false,
  parcel: undefined,
  lock: undefined,
  original: undefined,
  draft: undefined,
  status: "idle",
  lockHolder: undefined,
};

const slice = createSlice({
  name: "editing",
  initialState,
  reducers: {
    setEditStatus(state, action) {
      state.status = action.payload;
    },
    editStarted(state, action) {
      const { parcel, lock, sections } = action.payload;
      state.active = true;
      state.parcel = parcel;
      state.lock = lock;
      state.original = sections;
      state.draft = sections;
      state.lockHolder = undefined;
    },
    patchDraftSection(state, action) {
      const { section, changes } = action.payload;
      state.draft[section] = { ...state.draft[section], ...changes };
    },
    lockRenewed(state, action) {
      state.lock = action.payload;
      state.lockHolder = undefined;
    },
    lockLost(state, action) {
      state.lockHolder = action.payload;
    },
    editEnded() {
      return initialState;
    },
  },
});

export default slice;

export const {
  setEditStatus,
  editStarted,
  patchDraftSection,
  lockRenewed,
  lockLost,
  editEnded,
} = slice.actions;

export const getEditActive = (state) => state.editing.active;
export const getEditStatus = (state) => state.editing.status;
export const getEditParcel = (state) => state.editing.parcel;
export const getEditLockHolder = (state) => state.editing.lockHolder;
export const getDraftSection = (section) => (state) =>
  state.editing.draft?.[section];

export const getEditDirty = createSelector(
  [(state) => state.editing.original, (state) => state.editing.draft],
  (original, draft) => JSON.stringify(original) !== JSON.stringify(draft)
);
