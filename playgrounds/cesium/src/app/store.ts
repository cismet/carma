import { configureStore } from "@reduxjs/toolkit";

export const setupStore = () => {
  const store = configureStore({
    reducer: {},
  });

  return store;
};
