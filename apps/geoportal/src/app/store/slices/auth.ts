import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import { Item } from "@carma-commons/types";
import type { RootState } from "..";

export type AuthState = {
  jwt: string | undefined;
  user: string | undefined;
};

const initialState: AuthState = {
  jwt: undefined,
  user: undefined,
};

const slice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setJWT(state, action: PayloadAction<string>) {
      state.jwt = action.payload;
    },
    setUser(state, action: PayloadAction<string>) {
      state.user = action.payload;
    },
  },
});

export const { setJWT, setUser } = slice.actions;

export const getJWT = (state: RootState): string => state.auth.jwt;
export const getUser = (state: RootState): string => state.auth.user;

export default slice.reducer;
