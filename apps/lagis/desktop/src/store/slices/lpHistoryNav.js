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
    addPrevious(state, action) {
      state.previous.push(action.payload);
    },
    addNext(state, action) {
      state.next.push(action.payload);
    },
  },
});

export const { setCurrentLP, addPrevious, addNext } = slice.actions;

export const getCurrent = (state) => state.lpHistoryNav.current;
export const getPrevious = (state) => state.lpHistoryNav.previous;
export const getNext = (state) => state.lpHistoryNav.next;

export default slice;
