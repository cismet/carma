import { createSlice } from "@reduxjs/toolkit";
import { md5FetchText } from "react-cismap/tools/fetching";
import { getGazDataForTopicIds } from "react-cismap/tools/gazetteerHelper";

import { appKey, storagePostfix } from "../../../Keys";

export const gazetteerHost = "https://wupp-topicmaps-data.cismet.de/";
const topics = ["pois", "kitas", "bezirke", "quartiere", "adressen"];
const slice = createSlice({
  name: "users",
  initialState: {
    loading: "idle",
    entries: [],
  },
  reducers: {
    setGazdata(state, action) {
      state.entries = action.payload;
    },
  },
});

export const loadGazeteerEntries = () => {
  return async (dispatch, getState) => {
    const prefix = appKey + "." + storagePostfix;
    const sources = {};

    sources.adressen = await md5FetchText(prefix, gazetteerHost + "/data/3857/adressen.json");
    sources.bezirke = await md5FetchText(prefix, gazetteerHost + "/data/3857/bezirke.json");
    sources.quartiere = await md5FetchText(prefix, gazetteerHost + "/data/3857/quartiere.json");
    sources.pois = await md5FetchText(prefix, gazetteerHost + "/data/3857/pois.json");
    sources.kitas = await md5FetchText(prefix, gazetteerHost + "/data/3857/kitas.json");

    const gazData = getGazDataForTopicIds(sources, topics);
    dispatch(setGazdata(gazData));
  };
};

// Destructure and export the plain action creators
export const { setGazdata } = slice.actions;
export const getGazData = (state) => state.gazetteerData.entries;
export default slice;
