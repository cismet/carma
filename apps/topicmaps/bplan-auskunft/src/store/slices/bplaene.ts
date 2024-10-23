import { createSlice } from '@reduxjs/toolkit';
import {
  INFO_DOC_DATEINAMEN_NAME,
  INFO_DOC_DATEINAMEN_URL,
} from '../../constants/bplaene';
import booleanDisjoint from '@turf/boolean-disjoint';
import bboxPolygon from '@turf/bbox-polygon';
import center from '@turf/center';

const initialState = {
  data: undefined,
  loading: false,
};

const slice = createSlice({
  name: 'bplaene',
  initialState,
  reducers: {
    setData(state, action) {
      state.data = action.payload;
      return state;
    },
    setLoading(state, action) {
      state.loading = action.payload;
      return state;
    },
  },
});

export default slice;

export const loadBPlaene = (finishedHandler = () => {}) => {
  return async (dispatch) => {
    dispatch(setLoading(true));
    fetch('https://wunda-geoportal.cismet.de/data/bplaene.data.json')
      .then((response) => {
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        return response.json();
      })
      .then((result) => {
        finishedHandler();
        let features: unknown[] = [];
        let counter = 0;
        for (let item of result) {
          let itemFeature = convertBPlanToFeature(item, counter);
          features.push(itemFeature);
          counter++;
        }
        dispatch(setData(features));
        dispatch(setLoading(false));
      })
      .catch((error) => {
        console.error(
          'There was a problem with the fetch operation:',
          error.message
        );
        dispatch(setLoading(false));
      });
  };
};

function convertBPlanToFeature(bplan, index) {
  if (bplan === undefined) {
    return undefined;
  }
  const id = index;
  const type = 'Feature';
  const featuretype = 'B-Plan';

  const selected = false;
  const geometry = bplan.geojson;

  const text = bplan.nummer;

  if (bplan.docs.length > 0) {
    bplan.docs = [
      {
        file: INFO_DOC_DATEINAMEN_NAME,
        url: INFO_DOC_DATEINAMEN_URL,
      },
    ].concat(bplan.docs);
  }

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
    properties: bplan,
  };
}

export function getPlanFeatureByGazObject(
  gazObjects,
  done = (result) => {
    console.log(result);
  }
) {
  return function (dispatch, getState) {
    const state = getState();
    let finalResults: any = [];

    let hit = state.bplaene.data.find((elem: any) => {
      return elem.text === gazObjects[0].more.v;
    });

    if (hit) {
      finalResults.push(hit);
    }

    done(finalResults);
  };
}

export function getPlanFeatureByTitle(title: string, done: (hit: any) => void) {
  return function (dispatch) {
    let status: string | undefined = undefined;
    let nr = title;
    if (title.includes('(nicht rechtskräftig)')) {
      status = 'nicht rechtskräftig';
      nr = title.split(' (nicht rechtskräftig)')[0];
    } else if (title.includes('(rechtskräftig)')) {
      status = 'rechtskräftig';
      nr = title.split(' (rechtskräftig)')[0];
    }

    dispatch(getPlanFeature(nr, status, done));
  };
}

function getPlanFeature(nr, status, done) {
  return function (dispatch, getState) {
    const state = getState();

    const hit = state.bplaene.data.find((elem, index) => {
      if (status !== undefined) {
        return elem.text === nr && elem.properties.status === status;
      } else {
        return elem.text === nr;
      }
    });

    if (hit) {
      done(hit);
    }
  };
}

function distance(p, q) {
  var dx = p.x - q.x;
  var dy = p.y - q.y;
  var dist = Math.sqrt(dx * dx + dy * dy);
  return dist;
}

function getXYFromPointFeature(feature) {
  return {
    x: feature.geometry.coordinates[0],
    y: feature.geometry.coordinates[1],
  };
}

export function getPlanFeatures({
  boundingBox,
  point,
  done,
}: {
  boundingBox?: any;
  point?: any;
  done?: any;
}) {
  return function (dispatch, getState) {
    let bboxPoly;
    let finalResults: any = [];

    const state = getState();
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

    for (const feature of state.bplaene.data) {
      if (!booleanDisjoint(bboxPoly, feature)) {
        let tmpFeature = { ...feature };
        tmpFeature.searchDistance = distance(
          getXYFromPointFeature(center(bboxPoly)),
          getXYFromPointFeature(center(feature))
        );
        finalResults.push(tmpFeature);
      }
    }
    finalResults.sort((a, b) => a.searchDistance - b.searchDistance);

    done(finalResults);
  };
}

export const { setData, setLoading } = slice.actions;

export const getBPLaene = (state) => {
  return state.bplaene.data;
};

export const getLoading = (state) => {
  return state.bplaene.loading;
};
