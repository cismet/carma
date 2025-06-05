import { createSlice } from "@reduxjs/toolkit";
import L from "leaflet";
import proj4 from "proj4";

const initialState = {
  featureCollection: [],
  idsInEdit: [],
  selectedIndex: 0,
  boundingBox: null,
  autoFitBoundsTarget: null,
  autoFitBounds: false,
  searchInProgress: false,
  gazetteerHit: null,

  selectedBackgroundIndex: 2,

  backgrounds: [
    {
      layerkey: "bplan_abkg@30|wupp-plan-live@20",
      src: "/images/mapPreviewABK.png",
      title: "Top. Karte",
    },
    {
      layerkey: "rvrGrundriss@100|trueOrtho2024@60|rvrSchriftNT@100",
      src: "/images/mapPreviewOrtho.png",
      title: "Luftbildkarte",
    },
    {
      layerkey: "wupp-plan-live@40",
      src: "/images/mapPreviewCitymap.png",
      title: "Stadtplan",
    },
  ],
};

const slice = createSlice({
  name: "mapping",
  initialState,
  reducers: {
    mapBoundsChanged(state, action) {
      state.boundingBox = action.payload.bbox;
    },
    setFeatureCollection(state, action) {
      state.featureCollection = action.payload;
      state.selectedIndex = 0;
      return state;
    },
    setSelectedFeatureIndex(state, action) {
      let newState = JSON.parse(JSON.stringify(state));
      for (let feature of newState.featureCollection) {
        feature.selected = false;
      }
      if (action.payload !== undefined && action.payload !== null) {
        newState.featureCollection[action.payload].selected = true;
      }
      newState.selectedIndex = action.payload;
      return newState;
    },
    setAutoFit(state, action) {
      state.autoFitBounds = action.payload.autofit;
      state.autoFitBoundsTarget = action.payload.bounds;
    },
    gazetteerHit(state, action) {
      state.gazetteerHit = action.payload.hit;
    },
    setSelectedBackgroundIndex(state, action) {
      state.selectedBackgroundIndex = action.payload.selectedBackgroundIndex;
    },
    setIdsInEdit(state, action) {
      state.idsInEdit = action.payload.idsInEdit;
    },
  },
});

export default slice;

export const {
  gazetteerHit,
  mapBoundsChanged,
  setAutoFit,
  setFeatureCollection,
  setIdsInEdit,
  setSelectedBackgroundIndex,
  setSelectedFeatureIndex,
} = slice.actions;

export const getMapping = (state) => {
  return state.mapping;
};

export function boundsToArray(
  latLngBounds: L.LatLngBounds
): [[number, number], [number, number]] {
  const sw = latLngBounds.getSouthWest();
  const ne = latLngBounds.getNorthEast();
  return [
    [sw.lat, sw.lng],
    [ne.lat, ne.lng],
  ];
}

// export function fitFeatureBounds(feature, mode) {
//   return function (dispatch) {
//     const featureType = feature.geometry.type === "Point";

//     if (featureType) {
//       var lonLat = proj4(
//         "EPSG:25832",
//         "EPSG:4326",
//         feature.geometry.coordinates
//       );
//       var latLng = [lonLat[1], lonLat[0]];

//       const centerLat = latLng[0];
//       const centerLng = latLng[1];

//       const delta = 0.00009;
//       const sw: [number, number] = [centerLat - delta, centerLng - delta];
//       const ne: [number, number] = [centerLat + delta, centerLng + delta];
//       const tightBounds: [[number, number], [number, number]] = [sw, ne];

//       dispatch(
//         setAutoFit({
//           autofit: true,
//           bounds: tightBounds,
//         })
//       );
//     } else {
//       const projectedF = L.Proj.geoJson(feature);
//       const bounds = projectedF.getBounds();
//       dispatch(
//         setAutoFit({
//           autofit: true,
//           bounds: getSimpleBounds(bounds),
//         })
//       );
//     }
//   };
// }

function padBounds(bounds: L.LatLngBounds, minDelta = 0.0001): L.LatLngBounds {
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();

  let swLat = sw.lat,
    swLng = sw.lng;
  let neLat = ne.lat,
    neLng = ne.lng;

  const latDiff = neLat - swLat;
  const lngDiff = neLng - swLng;

  if (latDiff < minDelta) {
    const extra = (minDelta - latDiff) / 2;
    swLat -= extra;
    neLat += extra;
  }
  if (lngDiff < minDelta) {
    const extra = (minDelta - lngDiff) / 2;
    swLng -= extra;
    neLng += extra;
  }

  return L.latLngBounds([swLat, swLng], [neLat, neLng]);
}

export function fitFeatureBounds(feature, mode) {
  return function (dispatch) {
    const projected = L.Proj.geoJson(feature);
    let bounds = projected.getBounds();
    if (!bounds.isValid()) return;
    bounds = padBounds(bounds);
    dispatch(
      setAutoFit({
        autofit: true,
        bounds: boundsToArray(bounds),
      })
    );
  };
}

export function fitAll() {
  return function (dispatch, getState) {
    const currentState = getState();
    if (
      currentState !== undefined &&
      currentState.mapping !== undefined &&
      currentState.mapping.featureCollection !== undefined &&
      currentState.mapping.featureCollection.length !== undefined &&
      currentState.mapping.featureCollection.length > 0
    ) {
      dispatch(fitFeatureCollection(currentState.mapping.featureCollection));
    }
  };
}
export function fitFeatureCollection(features) {
  if (Array.isArray(features) === true && features.length > 0) {
    return function (dispatch) {
      const projectedFC = L.Proj.geoJson(features);
      const bounds = projectedFC.getBounds();
      dispatch(setAutoFit({ autofit: true, bounds: getSimpleBounds(bounds) }));
    };
  }
}

export function getSimpleBounds(latLngBounds) {
  return [
    [latLngBounds._northEast.lat, latLngBounds._northEast.lng],
    [latLngBounds._southWest.lat, latLngBounds._southWest.lng],
  ];
}

export function getLayerForFeatureId(routedmap, featureId) {
  let l = undefined;
  routedmap.leafletMap.leafletElement.eachLayer(function (layer) {
    if (layer.feature !== undefined && layer.feature.id === featureId) {
      l = layer;
    }
  });

  return l;
}

export function setSelectedFeatureIndexWithSelector(selector) {
  return function (dispatch, getState) {
    const featureCollection = getState().mapping.featureCollection;
    for (let i = 0, l = featureCollection.length; i < l; i++) {
      if (selector(featureCollection[i])) {
        dispatch(setSelectedFeatureIndex(i));
        break;
      }
    }
  };
}
