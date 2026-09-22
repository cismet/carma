import { createSlice } from "@reduxjs/toolkit";
import { getBoundsForFeatureArray } from "../../core/tools/mappingTools";
import { getLibreMapInstance } from "../../core/tools/libreMapRegistry";

const initialState = {
  flaechenCollection: undefined,
  frontenCollection: undefined,
  generalGeometryCollection: undefined,
  befreiungErlaubnisCollection: undefined,
  featureCollection: undefined,
  showCurrentFeatureCollection: true,
  showBackground: true,
  showInspectMode: true,
  graphqlLayerStatus: undefined,
  hasFittedBounds: false,
  mapInstance: undefined,
};

const slice = createSlice({
  name: "mapping",
  initialState,
  reducers: {
    setFlaechenCollection(state, action) {
      state.flaechenCollection = action.payload;
      return state;
    },
    setFrontenCollection(state, action) {
      state.frontenCollection = action.payload;
      return state;
    },
    setGeneralGeometryCollection(state, action) {
      state.generalGeometryCollection = action.payload;
      return state;
    },
    setGeneralGeometrySelected(state, action) {
      const { id } = action.payload;
      const selectedObject = state.generalGeometryCollection.find(
        (item) => item.properties.id === id
      );

      if (selectedObject.selected) {
        // clicked on an already selected feature and set map to optimally display that feature
        const bb = getBoundsForFeatureArray([selectedObject]);
        if (bb) {
          getLibreMapInstance()?.fitBounds(bb, { animate: false, padding: 20 });
        }
      } else {
        state.generalGeometryCollection.forEach((item) => {
          item.selected = false;
        });

        if (selectedObject) {
          selectedObject.selected = true;
        }
      }

      return state;
    },
    setFlaechenSelected(state, action) {
      const { id } = action.payload;
      const selectedObject = state.flaechenCollection.find(
        (item) => item.properties.id === `flaeche.${id}`
      );

      if (selectedObject.selected) {
        // clicked on an already selected feature and set map to optimally display that feature
        const bb = getBoundsForFeatureArray([selectedObject]);
        if (bb) {
          getLibreMapInstance()?.fitBounds(bb, { animate: false, padding: 20 });
        }
      } else {
        state.flaechenCollection.forEach((item) => {
          item.selected = false;
        });

        if (selectedObject) {
          selectedObject.selected = true;
        }
      }

      return state;
    },
    setFeatureHovered(state, action) {
      const { id } = action.payload;

      state.featureCollection.forEach((item) => {
        item.id === id ? (item.hovered = true) : (item.hovered = false);
      });

      return state;
    },
    setFrontenSelected(state, action) {
      const { id } = action.payload;
      const selectedObject = state.frontenCollection.find(
        (item) => item.properties.id === id
      );

      if (selectedObject.selected) {
        // clicked on an already selected feature and set map to optimally display that feature
        const bb = getBoundsForFeatureArray([selectedObject]);
        if (bb) {
          getLibreMapInstance()?.fitBounds(bb, { animate: false, padding: 20 });
        }
      } else {
        state.frontenCollection.forEach((item) => {
          item.selected = false;
        });

        if (selectedObject) {
          selectedObject.selected = true;
        }
      }

      return state;
    },
    setBefreiungErlaubnisCollection(state, action) {
      state.befreiungErlaubnisCollection = action.payload;
      return state;
    },
    setFeatureCollection(state, action) {
      state.featureCollection = action.payload;
      return state;
    },
    setShowCurrentFeatureCollection(state, action) {
      state.showCurrentFeatureCollection = action.payload;
      return state;
    },
    setShowBackground(state, action) {
      state.showBackground = action.payload;
      return state;
    },
    setShowInspectMode(state, action) {
      state.showInspectMode = action.payload;
      return state;
    },

    clear(state) {
      state.flaechenCollection = undefined;
      state.frontenCollection = undefined;
      state.generalGeometryCollection1 = undefined;
      state.befreiungErlaubnisCollection = undefined;
      return state;
    },
    setGraphqlLayerStatus(state, action) {
      state.graphqlLayerStatus = action.payload;
      return state;
    },
    setHasFittedBounds(state, action) {
      state.hasFittedBounds = action.payload;
    },
    setMapInstance(state, action) {
      state.mapInstance = action.payload;
    },
  },
});

export default slice;

export const {
  setFlaechenCollection,
  setFrontenCollection,
  setGeneralGeometryCollection,
  setGeneralGeometrySelected,
  setFlaechenSelected,
  setFeatureHovered,
  setFrontenSelected,
  setBefreiungErlaubnisCollection,
  setFeatureCollection,
  setShowCurrentFeatureCollection,
  setShowBackground,
  setShowInspectMode,
  clear,
  setGraphqlLayerStatus,
  setHasFittedBounds,
  setMapInstance,
} = slice.actions;

export const getFlaechenCollection = (state) => {
  return state.mapping.flaechenCollection;
};

export const getFrontenCollection = (state) => {
  return state.mapping.frontenCollection;
};

export const getGeneralGeometryCollection = (state) => {
  return state.mapping.generalGeometryCollection;
};

export const getBefreiungErlaubnisCollection = (state) => {
  return state.mapping.befreiungErlaubnisCollection;
};

export const getFeatureCollection = (state) => {
  return state.mapping.featureCollection;
};

export const getShowCurrentFeatureCollection = (state) => {
  return state.mapping.showCurrentFeatureCollection;
};

export const getShowBackground = (state) => {
  return state.mapping.showBackground;
};

export const getShowInspectMode = (state) => {
  return state.mapping.showInspectMode;
};
export const getGraphqlLayerStatus = (state) => {
  return state.mapping.graphqlLayerStatus;
};

export const getHasFittedBounds = (state) => {
  return state.mapping.hasFittedBounds;
};
