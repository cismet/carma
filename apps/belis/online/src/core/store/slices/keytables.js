import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  teams: [],
  leuchtmittel: [],
  rundsteuerempfaenger: [],
  tkey_leuchtentyp: [],
};
const slice = createSlice({
  name: "keytables",
  initialState: initialState,
  reducers: {
    set: (state, action) => action.payload,

    setTeams(state, action) {
      state.teams = action.payload;
      return state;
    },
    setLeuchtmittel(state, action) {
      state.leuchtmittel = action.payload;
      return state;
    },
    setRundsteuerempfaenger(state, action) {
      state.rundsteuerempfaenger = action.payload;
      return state;
    },
    setLeuchtentypen(state, action) {
      state.tkey_leuchtentyp = action.payload;
      return state;
    },
  },
});

export default slice;

//actions
export const {
  setTeams,
  setLeuchtmittel,
  setRundsteuerempfaenger,
  setLeuchtentypen,
} = slice.actions;

//selectors
export const getTeamsKT = (state) => state.keytables.teams;
export const getLeuchtmittelKT = (state) => state.keytables.leuchtmittel;
export const getRundsteuerempfaengerKT = (state) => state.keytables.rundsteuerempfaenger;
export const getLeuchtentypenKT = (state) => state.keytables.tkey_leuchtentyp;

export const fillTeamsFromDexie = () => {
  return async (dispatch, getState) => {
    const dexieW = getState().dexie.worker;
    const teams = await dexieW.getAll("team");
    dispatch(setTeams(teams));
  };
};
export const fillLeuchtmittelFromDexie = () => {
  return async (dispatch, getState) => {
    const dexieW = getState().dexie.worker;
    const leuchtmittel = await dexieW.getAll("leuchtmittel");
    dispatch(setLeuchtmittel(leuchtmittel));
  };
};

export const fillRundsteuerempfaengerFromDexie = () => {
  return async (dispatch, getState) => {
    const dexieW = getState().dexie.worker;
    const rundsteuerempfaenger = await dexieW.getAll("rundsteuerempfaenger");
    dispatch(setRundsteuerempfaenger(rundsteuerempfaenger));
  };
};

export const fillLeuchtentypenFromDexie = () => {
  return async (dispatch, getState) => {
    const dexieW = getState().dexie.worker;
    const tkey_leuchtentyp = await dexieW.getAll("tkey_leuchtentyp");
    dispatch(setLeuchtentypen(tkey_leuchtentyp));
  };
};
