import { createSlice } from "@reduxjs/toolkit";
import { RootState } from "..";

const initialState = {
  data: {} as Record<string, unknown[]>,
  errors: {} as Record<string, string>,
  loading: false,
  fetched: false,
};

const slice = createSlice({
  name: "keyTables",
  initialState,
  reducers: {
    setKeyTablesData(state, action) {
      state.data = action.payload;
      state.fetched = true;
    },
    setKeyTablesErrors(state, action) {
      state.errors = action.payload;
    },
    setKeyTablesLoading(state, action) {
      state.loading = action.payload;
    },
  },
});

export default slice;

export const { setKeyTablesData, setKeyTablesErrors, setKeyTablesLoading } =
  slice.actions;

export const getKeyTablesData = (state: RootState) => state.keyTables.data;
export const getKeyTablesErrors = (state: RootState) => state.keyTables.errors;
export const getKeyTablesLoading = (state: RootState) =>
  state.keyTables.loading;
export const getKeyTablesFetched = (state: RootState) =>
  state.keyTables.fetched;
