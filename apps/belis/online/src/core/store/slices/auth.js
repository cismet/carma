import { createSlice } from "@reduxjs/toolkit";

const initialState = { jwt: undefined, login: undefined, loginRequested: false };

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
  },
});

export default slice;

export const { storeJWT, storeLogin, setLoginRequested } = slice.actions;

export const getJWT = (state) => {
  return state.auth.jwt;
};
export const getLogin = (state) => {
  return state.auth.login;
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
