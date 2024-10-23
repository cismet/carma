import { createSlice } from '@reduxjs/toolkit';

import { integrateIntermediateResults } from '../../helper/featureHelper';
import { convertBounds2BBox } from '../../helper/gisHelper';
import { zoomToFeature } from '../../helper/mapHelper';
import { loadObjectsIntoFeatureCollection } from './featureCollectionSubslices/objects';
import { loadTaskListsIntoFeatureCollection } from './featureCollectionSubslices/tasklists';
import { getMapRef } from './map';
import { getIntermediateResults } from './offlineActionDb';
import {
  isSearchModeActive,
  isSearchModeWished,
  setActive as setSearchModeActive,
  setWished as setSearchModeWished,
} from './search';
import { getZoom } from './zoom';

const focusedSearchMinimumZoomThreshhold = 18;
const searchMinimumZoomThreshhold = 19;
export const MODES = {
  OBJECTS: 'OBJECTS',
  TASKLISTS: 'TASKLISTS',
  PROTOCOLS: 'PROTOCOLS',
};

export const initialFilter = {
  tdta_leuchten: { title: 'Leuchten', enabled: true },
  tdta_standort_mast: { title: 'Masten (ohne Leuchten)', enabled: true },
  mauerlasche: { title: 'Mauerlaschen', enabled: true },
  leitung: { title: 'Leitungen', enabled: true },
  schaltstelle: { title: 'Schaltstellen', enabled: true },
  abzweigdose: { title: 'Abzweigdosen', enabled: true },
};
const initialInFocusMode = false;

const initForModes = (initionalizationValue) => {
  const ret = {};
  for (const mode of Object.values(MODES)) {
    ret[mode] = initionalizationValue;
  }
  return ret;
};

const featureCollectionSlice = createSlice({
  name: 'featureCollection',
  initialState: {
    features: initForModes([]),
    featuresMap: initForModes({}),
    info: initForModes({}),
    done: initForModes(true),
    filter: initialFilter,
    selectedFeature: initForModes(null),
    requestBasis: undefined,
    inFocusMode: initialInFocusMode,
    secondaryInfoVisible: false,
    overlayFeature: undefined,
    gazeteerHit: undefined,
    boundingBox: undefined,
    mode: MODES.OBJECTS,
    origin: initForModes(undefined),
  },
  reducers: {
    setFeatureCollectionForMode: (state, action) => {
      const { mode, features } = action.payload;
      console.time('setFeatureCollection');

      state.features[mode] = features;
      let index = 0;
      if (features) {
        const fm = {};
        for (const f of state.features[mode]) {
          fm[f.id] = index++;
        }
        state.featuresMap[mode] = fm;
      }
      console.timeEnd('setFeatureCollection');
    },
    setFeatureCollectionInfoForMode: (state, action) => {
      const { mode, info } = action.payload;
      state.info[mode] = info;
    },

    updateFeatureForMode: (state, action) => {
      const { mode, feature } = action.payload;
      const index = state.featuresMap[mode][feature.id];
      feature.index = index;
      if (state.selectedFeature[mode].id === feature.id) {
        feature.selected = true;
        state.selectedFeature[mode] = feature;
      } else {
      }
      state.features[mode][index] = feature;
    },

    setDoneForMode: (state, action) => {
      const { mode, done } = action.payload;
      state.done[mode] = done;
    },
    setOriginForMode: (state, action) => {
      const { mode, origin } = action.payload;
      state.origin[mode] = origin;
    },

    setBoundingBox: (state, action) => {
      state.boundingBox = action.payload;
    },
    setOverlayFeature: (state, action) => {
      state.overlayFeature = action.payload;
    },
    setGazetteerHit: (state, action) => {
      state.gazetteerHit = action.payload;
    },
    setFilter: (state, action) => {
      state.filter = action.payload;
    },
    setMode: (state, action) => {
      state.mode = action.payload;
    },

    setSelectedFeatureForMode: (state, action) => {
      const { selectedFeature, mode, selectedFeatureIndex } = action.payload;
      console.time('setSelectedFeature');
      const fc = state.features[mode]; //JSON.parse(JSON.stringify(state.features));

      if (state.selectedFeature[mode]) {
        // const oldSelectedFeature = fc.find((f) => f.id === state.selectedFeature.id);
        const oldSelectedFeature =
          fc[state.featuresMap[mode][state.selectedFeature[mode].id]];
        if (oldSelectedFeature) {
          if (oldSelectedFeature?.id !== selectedFeature?.id) {
            oldSelectedFeature.selected = false;
          } else {
          }
        }
      }
      if (selectedFeature) {
        // state.selectedFeature = fc.find((f) => f.id === selectedFeature.id);
        state.selectedFeature[mode] =
          fc[state.featuresMap[mode][selectedFeature.id]];
      } else if (selectedFeatureIndex !== undefined) {
        state.selectedFeature[mode] = fc[selectedFeatureIndex];
      } else {
        state.selectedFeature[mode] = null;
      }
      if (state.selectedFeature[mode]) {
        state.selectedFeature[mode].selected = true;
      }
      console.timeEnd('setSelectedFeature');
    },

    setRequestBasis: (state, action) => {
      state.requestBasis = action.payload;
    },
    setFocusModeActive: (state, action) => {
      state.inFocusMode = action.payload;
    },
    setSecondaryInfoVisible: (state, action) => {
      state.secondaryInfoVisible = action.payload;
    },
  },
});
export const {
  setFeatureCollectionForMode,
  setFeatureCollectionInfoForMode,
  updateFeatureForMode,
  setDoneForMode,
  setBoundingBox,
  setFilter,
  setSelectedFeatureForMode,
  setRequestBasis,
  setFocusModeActive,
  setSecondaryInfoVisible,
  setOverlayFeature,
  setGazetteerHit,
  setMode,
  setOriginForMode,
} = featureCollectionSlice.actions;

export const getFeatureCollection = (state) => {
  return state.featureCollection.features[state.featureCollection.mode];
};
export const getFeatureCollections = (state) => {
  return state.featureCollection.features;
};
export const isDone = (state) =>
  state.featureCollection.done[state.featureCollection.mode];
export const getDones = (state) => state.featureCollection.done;

export const getFilter = (state) => state.featureCollection.filter;
export const getOrigin = (state) =>
  state.featureCollection.origin[state.featureCollection.mode];
export const getOrigins = (state) => state.featureCollection.origin;

export const getFeatureCollectionMode = (state) => state.featureCollection.mode;
export const getSelectedFeature = (state) =>
  state.featureCollection.selectedFeature[state.featureCollection.mode];
export const getSelectedFeaturesForAllModes = (state) =>
  state.featureCollection.selectedFeature;
const getRequestBasis = (state) => state.featureCollection.requestBasis;
export const isInFocusMode = (state) => state.featureCollection.inFocusMode;
export const isSecondaryInfoVisible = (state) =>
  state.featureCollection.secondaryInfoVisible;
export const getFeatureCollectionInfo = (state) =>
  state.featureCollection.info[state.featureCollection.mode];
export const getOverlayFeature = (state) =>
  state.featureCollection.overlayFeature;
export const getGazetteerHit = (state) => state.featureCollection.gazetteerHit;

export default featureCollectionSlice;

export const setSelectedFeature = (selectedFeature) => {
  return (dispatch, getState) => {
    const state = getState();
    const mode = state.featureCollection.mode;
    const mapRef = getMapRef(state);
    const oldSelectedFeature = getSelectedFeature(state);
    if (selectedFeature && oldSelectedFeature?.id === selectedFeature?.id) {
      dispatch(setSelectedFeatureForMode({ selectedFeature, mode }));
      zoomToFeature({ feature: selectedFeature, mapRef });
    } else {
      dispatch(setSelectedFeatureForMode({ selectedFeature, mode }));
    }
  };
};

export const setFeatureCollection = (features) => {
  return (dispatch, getState) => {
    const mode = getState().featureCollection.mode;
    dispatch(setFeatureCollectionForMode({ features, mode }));
  };
};
export const setDone = (done) => {
  return (dispatch, getState) => {
    const mode = getState().featureCollection.mode;
    dispatch(setDoneForMode({ mode, done }));
  };
};
export const setFeatureCollectionInfo = (info) => {
  return (dispatch, getState) => {
    const mode = getState().featureCollection.mode;
    dispatch(setFeatureCollectionInfoForMode({ info, mode }));
  };
};

export const forceRefresh = () => {
  return async (dispatch, getState) => {
    const state = getState();
    dispatch(
      setFeatureCollectionForMode({ mode: MODES.OBJECTS, features: [] })
    );
    dispatch(
      setFeatureCollectionForMode({ mode: MODES.TASKLISTS, features: [] })
    );
    dispatch(
      setFeatureCollectionForMode({ mode: MODES.PROTOCOLS, features: [] })
    );
    dispatch(setSelectedFeature(null));
    const onlineDataForcing = false;
    if (state.featureCollection.boundingBox || state.mapInfo.bounds) {
      dispatch(
        loadObjects({
          boundingBox:
            state.featureCollection.boundingBox ||
            convertBounds2BBox(state.mapInfo.bounds),
          jwt: state.auth.jwt,
          force: true,
          onlineDataForcing,
        })
      );
    }
    if (state.team.selectedTeam) {
      dispatch(
        loadTaskLists({
          team: state.team.selectedTeam,
          jwt: state.auth.jwt,
        })
      );
    }
  };
};

export const loadObjects = ({
  boundingBox,
  _inFocusMode,
  zoom,
  overridingFilterState,
  jwt,
  force = false,
  onlineDataForcing,
  manualRequest = false,
}) => {
  return async (dispatch, getState) => {
    if (!jwt || !boundingBox) {
      return;
    }

    const state = getState();
    const inFocusMode = _inFocusMode || isInFocusMode(state);
    const _searchForbidden = _isSearchForbidden({ inFocusMode }, state);
    const _filterState = getFilter(state);
    const searchModeWished = isSearchModeWished(state);
    let searchModeActive = isSearchModeActive(state);

    const requestBasis = getRequestBasis(state);

    if (_searchForbidden === true && searchModeActive === true) {
      dispatch(setSearchModeWished(true));
      dispatch(setSearchModeActive(false));
      return;
    } else if (
      _searchForbidden === false &&
      searchModeWished === true &&
      searchModeActive === false
    ) {
      dispatch(setSearchModeWished(true));
      dispatch(setSearchModeActive(true));
      searchModeActive = true; //because we use it directly
    } else if (_searchForbidden === false && searchModeActive === true) {
      dispatch(setSearchModeWished(true));
    }
    if (searchModeActive === true || manualRequest === true) {
      const _filterstate = overridingFilterState || _filterState;
      const reqBasis =
        JSON.stringify(boundingBox) +
        '.' +
        JSON.stringify(_filterstate) +
        '.' +
        inFocusMode;

      if (reqBasis !== requestBasis || force) {
        dispatch(setRequestBasis(reqBasis));
        dispatch(setBoundingBox(boundingBox));

        let xbb;
        if (inFocusMode) {
          const w = boundingBox.right - boundingBox.left;
          const h = boundingBox.top - boundingBox.bottom;

          const focusBB = {
            left: boundingBox.left + w / 4,
            top: boundingBox.top - h / 4,
            right: boundingBox.right - w / 4,
            bottom: boundingBox.bottom + h / 4,
          };
          xbb = focusBB;
        } else {
          xbb = boundingBox;
        }

        dispatch(
          loadObjectsIntoFeatureCollection({
            boundingBox: xbb,
            jwt: jwt,
            onlineDataForcing,
          })
        );
      }
    }
  };
};

export const loadTaskLists = ({ onlineDataForcing, team, done = () => {} }) => {
  return async (dispatch, getState) => {
    const state = getState();
    const jwt = state.auth.jwt;
    if (!jwt) {
      return;
    }

    dispatch(
      loadTaskListsIntoFeatureCollection({
        onlineDataForcing,
        team: team || state.team.selectedTeam,
        jwt,
        done,
      })
    );
  };
};

export const reSetSelecteFeatureFromCollection = (_featureCollection) => {
  return (dispatch, getState) => {
    const state = getState();
    const featureCollection = _featureCollection || getFeatureCollection(state);
    const oldSelectedFeature = getSelectedFeature(state);
    const selectedFeature = featureCollection.find(
      (f) => f.id === oldSelectedFeature.id
    );
    const mode = state.featureCollection.mode;
    dispatch(setSelectedFeatureForMode({ selectedFeature, mode }));
  };
};

export const integrateIntermediateResultsIntofeatureCollection = (
  intermediateResults
) => {
  return async (dispatch, getState) => {
    const state = getState();
    // need to create a new featurecollection because the retrieved collection is immutable
    console.time('integrateIntermediateResultsIntofeatureCollection.clone.FC');
    const featureCollection = JSON.parse(
      JSON.stringify(getFeatureCollection(state))
    );
    console.timeEnd(
      'integrateIntermediateResultsIntofeatureCollection.clone.FC'
    );

    const _intermediateResults =
      intermediateResults || getIntermediateResults(state);
    for (const feature of featureCollection) {
      integrateIntermediateResults(feature, _intermediateResults);
    }

    //re set the featurecollection
    dispatch(setFeatureCollection(featureCollection));
    dispatch(reSetSelecteFeatureFromCollection(featureCollection));
  };
};

export const timeout = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

export const isSearchForbidden = (state) => {
  return _isSearchForbidden(undefined, state);
};
//this allows us to override certain values in a time critical case
const _isSearchForbidden = (overrides = {}, state) => {
  let _zoom = overrides.zoom || getZoom(state);
  let inFocusMode = isInFocusMode(state);
  if (_zoom === -1) {
    _zoom = new URLSearchParams(window.location.search).get('zoom');
  }
  let ifm; //= overrides.inFocusMode || inFocusMode;
  if (overrides.inFocusMode !== undefined) {
    ifm = overrides.inFocusMode;
  } else {
    ifm = inFocusMode;
  }
  return (
    (ifm === true && _zoom < focusedSearchMinimumZoomThreshhold) ||
    (ifm === false && _zoom < searchMinimumZoomThreshhold)
  );
};
