import { createSlice } from "@reduxjs/toolkit";
import { ENDPOINT, jwtTestQuery } from "../../constants/belis";
import { fetchBelisRights } from "../../helper/rights";

const initialState = {
  jwt: undefined,
  login: undefined,
  loginRequested: false,
  permissions: undefined,
  // null = unknown, selectors then fall back to the Gast check.
  rights: null,
};

const slice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    storeJWT(state, action) {
      state.jwt = action.payload;
      return state;
    },
    storeLogin(state, action) {
      state.login = action.payload;
      return state;
    },
    setLoginRequested(state, action) {
      state.loginRequested = action.payload;
      return state;
    },
    storePermissions(state, action) {
      state.permissions = action.payload;
      return state;
    },
    storeRights(state, action) {
      state.rights = action.payload;
      return state;
    },
  },
});

export default slice;

export const {
  storeJWT,
  storeLogin,
  setLoginRequested,
  storePermissions,
  storeRights,
} = slice.actions;

export const loadRights = (jwt) => {
  return async (dispatch) => {
    dispatch(storeRights(await fetchBelisRights(jwt)));
  };
};

export const getJWT = (state) => {
  return state.auth.jwt;
};
export const getLogin = (state) => {
  return state.auth.login;
};

export const getPermissions = (state) => {
  return state.auth.permissions;
};

// Read-only mode: a "Gast" user is one whose only permission group is "Gast".
// Any additional group (or absence of permissions) means full editor access.
export const getIsReadOnly = (state) => {
  const permissions = state.auth.permissions;
  return (
    Array.isArray(permissions) &&
    permissions.length === 1 &&
    permissions[0] === "Gast"
  );
};

// Gast stays read-only; without loaded rights, everyone else keeps full access.
const hasRight = (state, key) => {
  if (getIsReadOnly(state)) return false;
  const rights = state.auth.rights;
  return rights ? rights[key] : true;
};

export const getRights = (state) => state.auth.rights;
export const canCreateBasic = (state) => hasRight(state, "createBasic");
export const canCreateAA = (state) => hasRight(state, "createAA");
export const canEditBasic = (state) => hasRight(state, "editBasic");
export const canEditAA = (state) => hasRight(state, "editAA");
export const canEditKeytables = (state) => hasRight(state, "editKeytables");
export const canDelete = (state) => hasRight(state, "delete");
// Delete only covers objects the user may also create.
export const canDeleteFachobjekte = (state) =>
  canDelete(state) && canCreateBasic(state);
export const canDeleteProtokolle = (state) =>
  canDelete(state) && canCreateAA(state);
// Edit mode is also needed to delete (danger zone, Protokoll deletion).
export const canUseEditMode = (state) =>
  canEditBasic(state) ||
  canEditAA(state) ||
  canDeleteFachobjekte(state) ||
  canDeleteProtokolle(state);

export const isLoginRequested = (state) => {
  return state.auth.loginRequested;
};
export const getLoginFromJWT = (jwt) => {
  if (jwt) {
    const base64Url = jwt.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map(function (c) {
          return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
        })
        .join("")
    );

    return JSON.parse(jsonPayload).sub;
  }
};

export const checkJWTValidation = () => {
  return async (dispatch, getState) => {
    const jwt = getState().auth.jwt;

    fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({
        query: jwtTestQuery,
      }),
    })
      .then((result) => {
        if (result.status === 401) {
          dispatch(storeJWT(undefined));
          dispatch(storeLogin(undefined));
        }
      })
      .catch((error) => {
        console.error(
          "There was a problem with the fetch operation:",
          error.message
        );

        dispatch(storeJWT(undefined));
        dispatch(storeLogin(undefined));
        dispatch(storePermissions(undefined));
        dispatch(storeRights(null));
      });
  };
};
