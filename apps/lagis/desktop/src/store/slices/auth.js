import { createSlice } from "@reduxjs/toolkit";
import { LAGIS_DOMAIN, REST_SERVICE_LAGIS } from "../../constants/lagis";
import { canReadWrite } from "../../core/editing/permissions";

const initialState = {
  jwt: undefined,
  login: undefined,
  loginRequested: false,
  loading: false,
  error: null,
  readWrite: undefined,
};

const slice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    authStart: (state) => {
      state.loading = true;
    },
    authStopLoading: (state) => {
      state.loading = false;
    },
    storeJWT(state, action) {
      state.jwt = action.payload;
      state.loading = false;
      state.error = null;
      return state;
    },
    storeLogin(state, action) {
      state.login = action.payload;
      return state;
    },
    storeReadWrite(state, action) {
      state.readWrite = action.payload;
      return state;
    },
    setLoginRequested(state, action) {
      state.loginRequested = action.payload;
      return state;
    },
    authFailure: (state, action) => {
      state.jwt = null;
      state.loading = false;
      state.error = action.payload;
    },
  },
});

export default slice;
export const login = (
  user,
  pw,
  dispatch,
  navigate,
  info,
  devSecretUser,
  devSecretPassword
) => {
  // dispatch(authStart());

  let u, p;

  if (user === null || user === undefined || user === "") {
    u = devSecretUser;
  } else {
    u = user;
  }

  if (pw === null || pw === undefined || pw === "") {
    p = devSecretPassword;
  } else {
    p = pw;
  }
  fetch(REST_SERVICE_LAGIS + "/users", {
    method: "GET",
    headers: {
      Authorization: "Basic " + btoa(u + "@" + LAGIS_DOMAIN + ":" + p),
      "Content-Type": "application/json",
    },
  })
    .then(function (response) {
      if (response.status >= 200 && response.status < 300) {
        response.json().then(function (responseWithJWT) {
          const jwt = responseWithJWT.jwt;
          setTimeout(() => {
            dispatch(storeJWT(jwt));
            dispatch(storeLogin(u));
            dispatch(setLoginRequested(false));
            navigate("/");
          }, 500);
        });
      } else {
        info();
      }
    })
    .catch(function (err) {
      info();
    });
};
export const {
  storeJWT,
  storeLogin,
  storeReadWrite,
  setLoginRequested,
  authStart,
  authFailure,
  authStopLoading,
} = slice.actions;

export const getJWT = (state) => {
  return state.auth.jwt;
};
export const getCanWrite = (state) =>
  Boolean(state.auth.jwt) &&
  state.auth.readWrite?.jwt === state.auth.jwt &&
  state.auth.readWrite.granted;

export const loadReadWrite = () => async (dispatch, getState) => {
  const { jwt, readWrite } = getState().auth;
  if (!jwt || readWrite?.jwt === jwt) {
    return;
  }
  const granted = await canReadWrite(jwt);
  dispatch(storeReadWrite({ jwt, granted }));
};

export const getLogin = (state) => {
  return state.auth.login;
};
export const getAuthLoading = (state) => {
  return state.auth.loading;
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
