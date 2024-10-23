import { createSlice } from "@reduxjs/toolkit";
import {
  DOMAIN,
  ENDPOINT,
  REST_SERVICE,
  jwtTestQuery,
} from "../../constants/vkz";

const initialState = {
  jwt: undefined,
  login: undefined,
  loginRequested: false,
  isLoading: false,
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
    setIsLoading(state, action) {
      state.isLoading = action.payload;
      return state;
    },
  },
});

export default slice;

export const { storeJWT, storeLogin, setLoginRequested, setIsLoading } =
  slice.actions;

export const getJWT = (state) => {
  return state.auth.jwt;
};

export const getLogin = (state) => {
  return state.auth.login;
};

export const isLoginRequested = (state) => {
  return state.auth.loginRequested;
};

export const getIsLoading = (state) => {
  return state.auth.isLoading;
};

export const login = ({ username, password, navigate }) => {
  return async (dispatch, getState) => {
    dispatch(setIsLoading(true));

    fetch(REST_SERVICE + "/users", {
      method: "GET",
      headers: {
        Authorization:
          "Basic " + btoa(username + "@" + DOMAIN + ":" + password),
        "Content-Type": "application/json",
      },
    })
      .then(function (response) {
        if (response.status >= 200 && response.status < 300) {
          response.json().then(function (responseWithJWT) {
            const jwt = responseWithJWT.jwt;

            setTimeout(() => {
              dispatch(setIsLoading(false));
              dispatch(storeJWT(jwt));
              dispatch(storeLogin(username));
              dispatch(setLoginRequested(false));
              navigate();
            }, 500);
          });
        } else {
          dispatch(setIsLoading(false));
        }
      })
      .catch(function (err) {
        dispatch(setIsLoading(false));
      });
  };
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
      });
  };
};
