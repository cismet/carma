import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  kassenzeichenliste: [
    // "60037371",
    // "60048907",
    // "60058203",
    // "60053055",
    // "60082070",
  ],
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
