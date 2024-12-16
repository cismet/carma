import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  kassenzeichenliste: [],
};

const slice = createSlice({
  name: "searchMode",
  initialState,
  reducers: {
    storeKassenzeichenliste(state, action) {
      state.kassenzeichenliste = action.payload;
      return state;
    },
  },
});

export const { storeKassenzeichenliste } = slice.actions;

export const getKassenzeichenliste = (state) =>
  state.searchMode.kassenzeichenliste;

export default slice;
