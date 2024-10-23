import { createSlice } from "@reduxjs/toolkit";
import { fetchGraphQL } from "../../commons/graphql";
import { getLoginFromJWT } from "./auth";

export const HEALTHSTATUS = {
  OK: "OK",
  UNKNOWN: "UNKNOWN",
  ERROR: "ERROR",
  UNAUTHORIZED: "UNAUTHORIZED",
  OFFLINE: "OFFLINE",
};

const initialState = {
  lastSuccesfulCheck: undefined,
  lastSuccesfulUser: undefined,
  lastSuccesfulJWT: undefined,
  healthState: HEALTHSTATUS.UNKNOWN,
  lastProblem: undefined,
};

const slice = createSlice({
  name: "health",
  initialState,
  reducers: {
    setHealthState(state, action) {
      const now = new Date().getTime();
      const jwt = action.payload.jwt;
      const healthState = action.payload.healthState;

      switch (healthState) {
        case HEALTHSTATUS.OK:
          state.lastSuccesfulCheck = now;
          state.lastSuccesfulUser = getLoginFromJWT(jwt);
          state.lastSuccesfulJWT = jwt;
          state.healthState = healthState;
          break;
        case HEALTHSTATUS.ERROR:
        case HEALTHSTATUS.UNAUTHORIZED:
        case HEALTHSTATUS.OFFLINE:
          state.lastProblem = now;
          state.healthState = healthState;
          break;
        default:
          console.log("unknown healthState. this should not happen. payload:", action.payload);
          state.healthState = HEALTHSTATUS.UNKNOWN;
      }
      return state;
    },
  },
});
export const { setHealthState } = slice.actions;

export default slice;

export const getHealthState = (state) => {
  return state.health.healthState;
};
export const getHealthStateObject = (state) => {
  return state.health;
};
export const doHealthCheck = (jwt) => {
  return async (dispatch, getState) => {
    if (!navigator.onLine) {
      dispatch(slice.actions.setHealthState({ jwt, healthState: HEALTHSTATUS.OFFLINE }));
      return;
    } else {
      try {
        const result = await fetchGraphQL(
          `
        query  {
          tdta_leuchten (limit : 1) {
          id
        }
        tdta_standort_mast (limit : 1) {
          id
        }
        mauerlasche (limit : 1) {
          id
        }
        leitung (limit : 1) {
          id
        }
      
        schaltstelle (limit : 1) {
          id
        }
        abzweigdose (limit : 1) {
          id
        }
        arbeitsauftrag (limit : 1) {
          id
        }
        arbeitsprotokoll (limit : 1) {
          id
        }
      }`,
          {},
          jwt,
          true //forceSkipLogging
        );
        if (result.ok) {
          dispatch(slice.actions.setHealthState({ jwt, healthState: HEALTHSTATUS.OK }));
        } else if (result.status === 401) {
          dispatch(slice.actions.setHealthState({ jwt, healthState: HEALTHSTATUS.UNAUTHORIZED }));
        } else {
          dispatch(slice.actions.setHealthState({ jwt, healthState: HEALTHSTATUS.ERROR }));
        }
      } catch (e) {
        dispatch(slice.actions.setHealthState({ jwt, healthState: HEALTHSTATUS.ERROR }));
      }
    }
  };
};
