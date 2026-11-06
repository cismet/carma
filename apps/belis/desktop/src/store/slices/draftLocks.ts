import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { RootState } from "../index";

// `sperre` row held for one draft; persisted like the drafts themselves
export interface HeldDraftLock {
  type: string;
  id: number;
  label: string;
  lockId: number;
}

interface DraftLocksState {
  held: Record<string, HeldDraftLock>;
  // draft keys edited in another tab of this browser; not persisted
  otherTab: Record<string, true>;
}

const initialState: DraftLocksState = { held: {}, otherTab: {} };

const draftLocksSlice = createSlice({
  name: "draftLocks",
  initialState,
  reducers: {
    setHeldDraftLock(
      state,
      action: PayloadAction<{ key: string; lock: HeldDraftLock }>
    ) {
      state.held[action.payload.key] = action.payload.lock;
    },
    removeHeldDraftLock(state, action: PayloadAction<string>) {
      delete state.held[action.payload];
    },
    setOtherTab(state, action: PayloadAction<{ key: string; value: boolean }>) {
      state.otherTab ??= {};
      if (action.payload.value) {
        state.otherTab[action.payload.key] = true;
      } else {
        delete state.otherTab[action.payload.key];
      }
    },
  },
});

export const { setHeldDraftLock, removeHeldDraftLock, setOtherTab } =
  draftLocksSlice.actions;

export const getHeldDraftLocks = (
  state: RootState
): Record<string, HeldDraftLock> => state.draftLocks?.held ?? {};

export const isEditedInOtherTab = (state: RootState, key: string) =>
  Boolean(state.draftLocks?.otherTab?.[key]);

export default draftLocksSlice;
