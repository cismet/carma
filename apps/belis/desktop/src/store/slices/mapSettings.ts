import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  activeBackgroundLayer: "stadtplan",
  backgroundLayerOpacities: {},
};

const slice = createSlice({
  name: "mapSettings",
  initialState,
  reducers: {
    setActiveBackgroundLayer(state, action) {
      state.activeBackgroundLayer = action.payload;
      return state;
    },
    setBackgroundLayerOpacities(state, action) {
      state.backgroundLayerOpacities = action.payload;
      return state;
    },
  },
});

export default slice;

export const { setActiveBackgroundLayer, setBackgroundLayerOpacities } =
  slice.actions;

export const getActiveBackgroundLayer = (state) => {
  return state.mapSettings.activeBackgroundLayer;
};
export const getBackgroundLayerOpacities = (state) => {
  return state.mapSettings.backgroundLayerOpacities;
};
