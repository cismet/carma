import { createSlice } from "@reduxjs/toolkit";
import {
  fetchDienststellen,
  fetchMipaStammdaten,
  fetchNutzungStammdaten,
  fetchStrassennamen,
  fetchZusatzRolleArten,
} from "../../core/wizard/api";

const LOADERS = {
  dienststellen: (jwt) => fetchDienststellen(jwt),
  rolleArten: (jwt) => fetchZusatzRolleArten(jwt),
  strassennamen: () => fetchStrassennamen(),
  // { anlageklassen, nutzungsarten }, one query for both
  nutzung: (jwt) => fetchNutzungStammdaten(jwt),
  // { kategorien, merkmale }
  mipa: (jwt) => fetchMipaStammdaten(jwt),
};

const initialState = {
  dienststellen: undefined,
  rolleArten: undefined,
  strassennamen: undefined,
  nutzung: undefined,
  mipa: undefined,
};

const slice = createSlice({
  name: "stammdaten",
  initialState,
  reducers: {
    storeStammdatenList(state, action) {
      const { name, list } = action.payload;
      state[name] = list;
    },
  },
});

export default slice;

export const { storeStammdatenList } = slice.actions;

export const getStammdatenList = (name) => (state) => state.stammdaten[name];

// one request per list, even when several blocks ask at the same time
const inFlight = {};

export const ensureStammdatenList = (name) => async (dispatch, getState) => {
  const stored = getState().stammdaten[name];
  if (stored) {
    return stored;
  }
  if (!inFlight[name]) {
    inFlight[name] = LOADERS[name](getState().auth.jwt)
      .then((list) => {
        dispatch(storeStammdatenList({ name, list }));
        return list;
      })
      .finally(() => {
        delete inFlight[name];
      });
  }
  return inFlight[name];
};

export const ensureAdminStammdaten = () => async (dispatch) => {
  const [dienststellen, rolleArten, strassennamen] = await Promise.all([
    dispatch(ensureStammdatenList("dienststellen")),
    dispatch(ensureStammdatenList("rolleArten")),
    dispatch(ensureStammdatenList("strassennamen")),
  ]);
  return { dienststellen, rolleArten, strassennamen };
};
