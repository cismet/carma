import { createSlice } from '@reduxjs/toolkit';
import bboxPolygon from '@turf/bbox-polygon';
import booleanDisjoint from '@turf/boolean-disjoint';
import { setFeatureCollection, setSelectedFeatureIndex } from './mapping';

const initialState = {
  data: undefined,
};

const slice = createSlice({
  name: 'aev',
  initialState,
  reducers: {
    setData(state, action) {
      state.data = action.payload;
      return state;
    },
  },
});

export default slice;

export const loadAEVs = () => {
  return async (dispatch: any) => {
    fetch('https://wunda-geoportal.cismet.de/data/aenderungsv.data.json')
      .then((response) => {
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        return response.json();
      })
      .then((result) => {
        let features: any = [];
        let counter = 0;
        for (let item of result) {
          let itemFeature = convertAEVToFeature(item, counter);
          features.push(itemFeature);
          counter++;
        }
        dispatch(setData(features));
      })
      .catch((error) => {
        console.error(
          'There was a problem with the fetch operation:',
          error.message
        );
      });
  };
};

export function getAEVFeatureByGazObject(
  gazObjects,
  done = (result) => {
    console.log(result);
  }
) {
  return function (dispatch, getState) {
    const state = getState();
    let finalResults: any = [];

    let hit = state.aev.data.find((elem: any) => {
      return elem.text === gazObjects[0].more.v;
    });

    if (hit) {
      finalResults.push(hit);
    }

    done(finalResults);
  };
}

export function searchForAEVs({
  gazObject,
  boundingBox,
  point,
  done = (result: any) => {
    console.log(result);
  },
}: {
  gazObject: any;
  boundingBox: any;
  point: any;
  done: (result: any) => void;
}) {
  return function (dispatch: any, getState: any) {
    const state = getState();
    let finalResults: any = [];

    if (
      gazObject === undefined &&
      (boundingBox !== undefined || point !== undefined)
    ) {
      let bboxPoly;
      if (boundingBox !== undefined) {
        bboxPoly = bboxPolygon([
          boundingBox.left,
          boundingBox.top,
          boundingBox.right,
          boundingBox.bottom,
        ]);
      } else if (point !== undefined) {
        bboxPoly = bboxPolygon([
          point.x - 0.05,
          point.y - 0.05,
          point.x + 0.05,
          point.y + 0.05,
        ]);
      }

      for (let feature of state.aev.data) {
        if (!booleanDisjoint(bboxPoly as any, feature)) {
          finalResults.push(feature);
        }
      }
    } else if (
      gazObject !== undefined &&
      gazObject[0] !== undefined &&
      gazObject[0].type === 'aenderungsv'
    ) {
      if (state.aev.data.length === 0) {
        loadAEVs();
      }

      let hit = state.aev.data.find((elem: any) => {
        return elem.name === gazObject[0].more.v;
      });
      if (hit) {
        finalResults.push(hit);
      }
    } else if (
      gazObject !== undefined &&
      gazObject[0] !== undefined &&
      gazObject[0].type === 'bplaene'
    ) {
      let hit = state.aev.data.find((elem, index) => {
        let bplanArr = [];
        if (elem.properties.bplan_nr !== undefined) {
          bplanArr = elem.properties.bplan_nr.split('+');
        }
        let found = false;
        bplanArr.forEach((nr) => {
          found = found || nr === gazObject[0].more.v;
        });
        return found;
      });

      if (hit) {
        finalResults.push(hit);
      }
    }
    dispatch(setFeatureCollection(finalResults));
    dispatch(setSelectedFeatureIndex(0));

    done(finalResults);
  };
}

export function getAEVsByNrs(nrArr, done = (results: any) => {}) {
  return function (dispatch, getState) {
    const state = getState();
    let finalResults: any = [];
    if (state.aev.data.length === 0) {
      loadAEVs();
    }
    for (const nr of nrArr) {
      let hit = state.aev.data.find((elem, index) => {
        return elem.properties.name === nr;
      });
      if (hit) {
        finalResults.push(hit);
      }
    }
    done(finalResults);
  };
}

export function getAEVByNr(nr, done = (results: any) => {}) {
  return function (dispatch, getState) {
    dispatch(getAEVsByNrs([nr], done));
  };
}

function convertAEVToFeature(aev, index) {
  if (aev === undefined) {
    return undefined;
  }
  const id = aev.id;
  const type = 'Feature';
  const featuretype = 'Änderungsverfahren';

  const selected = false;
  const geometry = aev.geojson;

  const text = aev.name;

  return {
    id,
    index,
    text,
    type,
    featuretype,
    selected,
    geometry,
    crs: {
      type: 'name',
      properties: {
        name: 'urn:ogc:def:crs:EPSG::25832',
      },
    },
    properties: aev,
  };
}

export const { setData } = slice.actions;

export const getData = (state) => {
  return state.aev.data;
};
