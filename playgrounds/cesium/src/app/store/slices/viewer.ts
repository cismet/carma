import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import defaultState from '../../config';
import { Cartesian3 } from 'cesium';

type PlainCartesian3 = {
  x: number;
  y: number;
  z: number;
};

export interface ViewerState {
  isAnimating: boolean;
  homePosition?: PlainCartesian3;
  homeOffset?: PlainCartesian3;
  dataSources?: {
    footprintGeoJson?: {
      url: string;
      name: string;
    };
    tileset?: {
      url: string;
      translation: PlainCartesian3;
    };
  };
}

export default createSlice({
  name: 'viewer',
  initialState: defaultState.viewer,
  reducers: {
    setIsAnimating: (state: ViewerState, action: PayloadAction<boolean>) => {
      state.isAnimating = action.payload;
    },
    toggleIsAnimating: (state: ViewerState) => {
      state.isAnimating = !state.isAnimating;
    },
    setHomePosition: (
      state: ViewerState,
      action: PayloadAction<Cartesian3>
    ) => {
      const { x, y, z } = action.payload;
      state.homePosition = { x, y, z };
    },
  },
});
