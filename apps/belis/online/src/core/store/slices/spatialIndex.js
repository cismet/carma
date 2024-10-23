import { createSlice } from "@reduxjs/toolkit";
import bbox from "@turf/bbox";
import Flatbush from "flatbush";
import kdbush from "kdbush";

// import { getDexieDB } from "../../indexeddb/dexiedb";
import { getDexieDB } from "./dexie";

// const idb = idbworker();
// idb.init();

const spatialIndexSlice = createSlice({
  name: "spatialIndex",
  initialState: {
    loading: undefined,
    pointIndex: undefined,
    lineIndex: undefined,
  },
  reducers: {
    startLoading(state, action) {
      if (state.loading === undefined) {
        state.loading = "started";
      }
    },
    initialize(state, action) {
      state.loading = "done";
      state.pointIndex = action.payload.pointIndex;
      state.lineIndex = action.payload.lineIndex;
    },
  },
});

export default spatialIndexSlice;

export const { startLoading, initialize } = spatialIndexSlice.actions;

export const getPointIndex = (state) => state.spatialIndex.pointIndex;
export const getLineIndex = (state) => state.spatialIndex.lineIndex;
export const getLoadingState = (state) => state.spatialIndex.loading;

export const initIndex =
  (finished = () => {}) =>
  async (dispatch, getState) => {
    dispatch(startLoading());
    const state = getState();
    const dexiedb = getDexieDB(state);
    const current = new Date().getTime();

    let pointItems, leitungen;

    //dexie
    pointItems = await dexiedb["raw_point_index"].toArray();
    leitungen = await dexiedb["leitung"].toArray();

    const coordinatesResolver = (o) => {
      try {
        return [o.x, o.y];
      } catch (e) {
        console.log("probblem in ", o);
        return [-1, -1];
      }
    };

    const pointIndex = new kdbush(
      pointItems,
      (p) => coordinatesResolver(p)[0],
      (p) => coordinatesResolver(p)[1]
    );

    console.log(
      "yyy Spatial PointIndex mit " +
        pointItems.length +
        " Objekten in " +
        (new Date().getTime() - current) +
        " ms angelegt."
    );

    const currentL = new Date().getTime();
    const features = [];
    for (const l of leitungen) {
      try {
        const properties = JSON.parse(JSON.stringify(l));
        const feature = {
          id: "Leitung-" + properties.id,
          text: "-",
          type: "Feature",
          featuretype: "leitung",
          selected: false,
          crs: {
            type: "name",
            properties: {
              name: "urn:ogc:def:crs:EPSG::25832",
            },
          },
          properties,
        };
        // use the type l.geom.geo_field.type, because there are also leitungen with a MultiLineString geometry
        feature.geometry = {
          type: l.geom.geo_field.type,
          coordinates: l.geom.geo_field.coordinates,
        };

        features.push(feature);
      } catch (e) {
        //console.log('problem with ', l);
      }
    }
    let lineIndex;
    if (features.length > 0) {
      lineIndex = new Flatbush(features.length);

      for (const f of features) {
        const bb = bbox(f);

        lineIndex.add(bb[0], bb[1], bb[2], bb[3]);
      }

      lineIndex.features = features;
      lineIndex.finish();

      console.log(
        "yyy Spatial LineIndex mit " +
          features.length +
          " Objekten in " +
          (new Date().getTime() - currentL) +
          " ms angelegt."
      );
    } else {
      lineIndex = new Flatbush(1);
      lineIndex.add(0, 0, 1, 1);
      lineIndex.features = [{}];
      lineIndex.finish();
      console.log("added dummy Spatial LineIndex  ");
    }

    dispatch(initialize({ pointIndex, lineIndex }));

    finished();
  };
