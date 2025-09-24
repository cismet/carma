import { createSlice } from "@reduxjs/toolkit";

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

export const { setCurrentLP, setOnlyCurrent, setPrevious, setNext } = slice.actions;

export const getCurrent = (state) => state.lpHistoryNav.current;
export const getPrevious = (state) => state.lpHistoryNav.previous;
export const getNext = (state) => state.lpHistoryNav.next;

export default slice;


export const hitPrevious = (cb) => {
  return async (dispatch, getState) => {
    const state = getState();
    const current = getCurrent(state);
    const previous = getPrevious(state);
    const next = getNext(state);
    if (previous.length > 0) {
      dispatch(setNext([current, ...next]));
      dispatch(setOnlyCurrent(previous[0]));
      dispatch(setPrevious(previous.slice(1)));
      cb(previous[0])
    }
  }
}

export const hitNext = (cb) => {
  return async (dispatch, getState) => {
    const state = getState();
    const current = getCurrent(state);
    const previous = getPrevious(state);
    const next = getNext(state);
    if (next.length > 0) {
      dispatch(setPrevious([current, ...previous]));
      dispatch(setOnlyCurrent(next[0]));
      dispatch(setNext(next.slice(1)));
      cb(next[0])
    }
  }
}