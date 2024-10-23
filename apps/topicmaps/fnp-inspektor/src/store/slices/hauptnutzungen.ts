import { createSlice } from '@reduxjs/toolkit';
import bboxPolygon from '@turf/bbox-polygon';
import booleanDisjoint from '@turf/boolean-disjoint';
import { getAEVByNr, getAEVsByNrs } from './aenderungsverfahren';
import { setFeatureCollection, setSelectedFeatureIndex } from './mapping';

const initialState = {
  data: undefined,
};

const slice = createSlice({
  name: 'hauptnutzungen',
  initialState,
  reducers: {
    setData(state, action) {
      state.data = action.payload;
      return state;
    },
  },
});

export const loadHauptnutzungen = () => {
  return async (dispatch: any) => {
    fetch('https://wunda-geoportal.cismet.de/data/hauptnutzungen.data.json')
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
          let itemFeature = convertHauptnutzungToFeature(item, counter);
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

function convertHauptnutzungToFeature(hn, index) {
  if (hn === undefined) {
    return undefined;
  }
  const id = hn.id;
  const type = 'Feature';
  const featuretype = 'Hauptnutzung';
  const selected = false;
  const geometry = hn.geojson;

  const text = hn.name;

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
    properties: hn,
  };
}

interface hauptnutzungen {
  gazObject?: any;
  boundingBox?: any;
  point?: any;
  done?: (result: any) => void;
}

export function searchForHauptnutzungen({
  gazObject,
  boundingBox,
  point,
  done,
}: hauptnutzungen) {
  return function (dispatch, getState) {
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

      //Simple
      const state = getState();
      let finalResults: any = [];
      for (let feature of state.hauptnutzungen.data) {
        if (!booleanDisjoint(bboxPoly, feature)) {
          finalResults.push(feature);
          if (
            feature.properties.fnp_aender === undefined &&
            feature.properties.siehe_auch_aev !== undefined
          ) {
            dispatch(
              getAEVsByNrs(feature.properties.siehe_auch_aev, (results) => {
                const out = JSON.parse(JSON.stringify(feature));
                console.log(out);
                out.properties.siehe_auch_aev = results;
                dispatch(setFeatureCollection([out]));
                dispatch(setSelectedFeatureIndex(0));
              })
            );
          } else {
            dispatch(
              getAEVByNr(feature.properties.fnp_aender, (results) => {
                //always one
                const out = JSON.parse(JSON.stringify(feature));
                out.properties.fnp_aender = results;
                dispatch(setFeatureCollection([out]));
                dispatch(setSelectedFeatureIndex(0));
              })
            );
          }
          break;
        }
      }
      if (finalResults.length === 0) {
        dispatch(setFeatureCollection([]));
      } else {
        done && done(finalResults);
      }
    } else if (point !== undefined) {
    }
  };
}

export default slice;

export const { setData } = slice.actions;
