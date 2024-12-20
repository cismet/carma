import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  kassenzeichenliste: [],
  shapeMode: "default",
  ifShapeModeAvailable: true,
};

const slice = createSlice({
  name: "searchMode",
  initialState,
  reducers: {
    storeKassenzeichenliste(state, action) {
      state.kassenzeichenliste = action.payload;
      return state;
    },
    storeShapeMode(state, action) {
      state.shapeMode = action.payload;
      return state;
    },
    storeIfShapeModeAvailable(state, action) {
      state.ifShapeModeAvailable = action.payload;
      return state;
    },
  },
});

export const searchWithRectangle = (searchParams) => {
  return async (dispatch, getState) => {
    const jwt = getState().auth.jwt;
    fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({
        query: kassenzeichenForGeomQuery,
        variables: searchParams,
      }),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Network response was not ok");
        }
        return response.json();
      })
      .then((result) => {
        const res = result.data.kassenzeichen.map(
          (r) => r.kassenzeichennummer8
        );
      })
      .catch((error) => {
        console.error(
          "There was a problem with the fetch operation:",
          error.message
        );
      });
  };
};

export const {
  storeKassenzeichenliste,
  storeShapeMode,
  storeIfShapeModeAvailable,
} = slice.actions;

export const getKassenzeichenliste = (state) =>
  state.searchMode.kassenzeichenliste;

export const getShapeMode = (state) => state.searchMode.shapeMode;
export const getIfShapeModeAvailable = (state) =>
  state.searchMode.ifShapeModeAvailable;

export default slice;
