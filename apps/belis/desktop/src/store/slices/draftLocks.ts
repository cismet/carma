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
}

const initialState: DraftLocksState = { held: {} };

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
  },
});

export const { setHeldDraftLock, removeHeldDraftLock } =
  draftLocksSlice.actions;

export const getHeldDraftLocks = (
  state: RootState
): Record<string, HeldDraftLock> => state.draftLocks?.held ?? {};

export default draftLocksSlice;
