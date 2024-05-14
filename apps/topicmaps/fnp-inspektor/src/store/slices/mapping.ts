import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  featureCollection: [],
  selectedFeatureIndex: 0,
};

const slice = createSlice({
  name: 'mapping',
  initialState,
  reducers: {
    setFeatureCollection(state, action) {
      state.featureCollection = action.payload;
      return state;
    },
    setSelectedFeatureIndex(state, action) {
      state.selectedFeatureIndex = action.payload;
      const features = state.featureCollection;
      features.forEach((feature, i) => {
        if (i === action.payload) {
          // @ts-ignore
          feature.selected = true;
        } else {
          // @ts-ignore
          feature.selected = false;
        }
      });
      state.featureCollection = features;
      return state;
    },
  },
});

export default slice;

export const { setFeatureCollection, setSelectedFeatureIndex } = slice.actions;

export const getFeatureCollection = (state) => {
  return state.mapping.featureCollection;
};

export const getSelectedFeatureIndex = (state) => {
  return state.mapping.selectedFeatureIndex;
};