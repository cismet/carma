import { createSlice } from '@reduxjs/toolkit';
import { DOMAIN, SERVICE } from '../../constants/cids';

export const types = {
  SET_LOGIN_INFORMATION: 'AUTH/SET_LOGIN_INFORMATION',
  SET_LOGIN_IN_PROGRESS: 'AUTH/SET_LOGIN_IN_PROGRESS',
  SET_STAC: 'AUTH/SET_STAC',
};

const initialState = {
  user: null,
  password: null,
  succesfullLogin: false,
  loginInProgress: false,
  loginInProgressTextInfo: 'XLaden der Daten ...',
  stac: null,
};

const slice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setLoginInformation(state, action) {
      state.user = action.payload.user;
      state.password = action.payload.password;
      state.loginInProgress = false;
      state.succesfullLogin = action.payload.status;
      state.stac = null;
    },
    setLoginInProgress(state, action) {
      state.loginInProgress = true;
      if (action.payload.loginInProgressTextInfo) {
        state.loginInProgressTextInfo = action.payload.loginInProgressTextInfo;
      }
    },
    setStac(state, action) {
      state.stac = action.payload;
      state.loginInProgress = false;
      state.succesfullLogin = true;
    },
  },
});

export default slice;

export const { setLoginInformation, setLoginInProgress, setStac } =
  slice.actions;

export const getLogin = (state) => {
  return state.auth.user;
};

export const getLoginInProgress = (state) => {
  return state.auth.loginInProgress;
};

export const getLoginInfoText = (state) => {
  return state.auth.loginInProgressTextInfo;
};

export const getStac = (state) => {
  return state.auth.stac;
};

export const login = (user, password, succesfulHandler) => {
  if (typeof succesfulHandler === 'undefined') {
    succesfulHandler = () => {};
  }
  return function (dispatch) {
    dispatch(setLoginInProgress({}));
    fetch(SERVICE + '/classes?domain=local&limit=1&offset=0&role=all', {
      method: 'GET',
      headers: {
        Authorization: 'Basic ' + btoa(user + '@' + DOMAIN + ':' + password),
        'Content-Type': 'application/json',
      },
    })
      .then(function (response) {
        if (response.status >= 200 && response.status < 300) {
          dispatch(setLoginInformation({ user, password, status: true }));
          dispatch(succesfulHandler);
        } else {
          dispatch(setLoginInformation({ user, password, status: true }));
        }
      })
      .catch(function (err) {
        // dispatch(UiStateActions.showError("Beim Login ist ein Fehler aufgetreten. (" + err + ")"));
        dispatch(setLoginInformation({ user, password, status: false }));
      });
  };
};

export const logout = () => {
  return function (dispatch) {
    dispatch(
      setLoginInformation({ user: null, password: null, status: false })
    );
  };
};
