import { createSlice } from "@reduxjs/toolkit";
import { ENDPOINT, jwtTestQuery } from "../../constants/belis";

const initialState = {
  jwt: undefined,
  login: undefined,
  loginRequested: false,
  permissions: undefined,
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
  },
});

export default slice;

export const { storeJWT, storeLogin, setLoginRequested, storePermissions } =
  slice.actions;

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
      });
  };
};
