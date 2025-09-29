import { createSlice } from "@reduxjs/toolkit";
import { HISTORY_LIMIT } from "../../constants/lagis";

const initialState = {
  current: null,
  previous: [],
  next: [],
};

const slice = createSlice({
  name: "lpHistoryNav",
  initialState,
  reducers: {
    setCurrentLP(state, action) {
      if (state.current) {
        state.previous.unshift(state.current);
        // Enforce history limit for previous items
        if (state.previous.length > HISTORY_LIMIT) {
          state.previous = state.previous.slice(0, HISTORY_LIMIT);
        }
      }

      if (state.next.length > 0) {
        state.next = [];
      }
      state.current = action.payload;
    },
    setOnlyCurrent(state, action) {
      state.current = action.payload;
    },
    setPrevious(state, action) {
      state.previous = action.payload;
    },
    setNext(state, action) {
      state.next = action.payload;
    },
  },
});

export const { setCurrentLP, setOnlyCurrent, setPrevious, setNext } =
  slice.actions;

export const getCurrentLParcelNav = (state) => state.lpHistoryNav.current;
export const getPrevious = (state) => state.lpHistoryNav.previous;
export const getNext = (state) => state.lpHistoryNav.next;

export default slice;

export const hitPrevious = (cb) => {
  return async (dispatch, getState) => {
    const state = getState();
    const current = getCurrentLParcelNav(state);
    const previous = getPrevious(state);
    const next = getNext(state);
    if (previous.length > 0) {
      const newNext = [current, ...next];
      const limitedNext =
        newNext.length > HISTORY_LIMIT
          ? newNext.slice(0, HISTORY_LIMIT)
          : newNext;
      dispatch(setNext(limitedNext));
      dispatch(setOnlyCurrent(previous[0]));
      dispatch(setPrevious(previous.slice(1)));
      cb(previous[0]);
    }
  };
};

export const hitNext = (cb) => {
  return async (dispatch, getState) => {
    const state = getState();
    const current = getCurrentLParcelNav(state);
    const previous = getPrevious(state);
    const next = getNext(state);
    if (next.length > 0) {
      const newPrevious = [current, ...previous];
      const limitedPrevious =
        newPrevious.length > HISTORY_LIMIT
          ? newPrevious.slice(0, HISTORY_LIMIT)
          : newPrevious;
      dispatch(setPrevious(limitedPrevious));
      dispatch(setOnlyCurrent(next[0]));
      dispatch(setNext(next.slice(1)));
      cb(next[0]);
    }
  };
};

export const hitPrevItem = (cb, arrKey) => {
  return async (dispatch, getState) => {
    const state = getState();
    const current = getCurrentLParcelNav(state);
    const previous = getPrevious(state);
    const next = getNext(state);

    if (previous.length > 0) {
      const selectedItem = previous[arrKey];
      const movingItemsStack = previous.slice(0, arrKey).reverse();
      const restPrevItems = previous.slice(arrKey + 1, previous.length);
      const newNext = [...movingItemsStack, current, ...next];
      // Enforce history limit for next items
      const limitedNext =
        newNext.length > HISTORY_LIMIT
          ? newNext.slice(0, HISTORY_LIMIT)
          : newNext;
      dispatch(setNext(limitedNext));
      dispatch(setOnlyCurrent(selectedItem));
      dispatch(setPrevious(restPrevItems));
      cb(selectedItem);
    }
  };
};

export const hitNextItem = (cb, arrKey) => {
  return async (dispatch, getState) => {
    const state = getState();
    const current = getCurrentLParcelNav(state);
    const previous = getPrevious(state);
    const next = getNext(state);

    if (next.length > 0) {
      const selectedItem = next[arrKey];
      const movingItemsStack = next.slice(0, arrKey).reverse();
      const restNextItems = next.slice(arrKey + 1, next.length);
      const newPrevious = [...movingItemsStack, current, ...previous];
      // Enforce history limit for previous items
      const limitedPrevious =
        newPrevious.length > HISTORY_LIMIT
          ? newPrevious.slice(0, HISTORY_LIMIT)
          : newPrevious;
      dispatch(setPrevious(limitedPrevious));
      dispatch(setOnlyCurrent(selectedItem));
      dispatch(setNext(restNextItems));
      cb(selectedItem);
    }
  };
};
