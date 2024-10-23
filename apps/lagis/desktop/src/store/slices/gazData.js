import { createSlice } from "@reduxjs/toolkit";
import { md5FetchText } from "react-cismap/tools/fetching";
import { getGazDataForTopicIds } from "react-cismap/tools/gazetteerHelper";

import { APP_KEY, STORAGE_PREFIX } from "../../constants/lagis";

export const gazetteerHost = "https://wupp-topicmaps-data.cismet.de/";
const topics = ["pois", "adressen"];
const slice = createSlice({
  name: "gazetteerData",
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
    const prefix = APP_KEY + "." + STORAGE_PREFIX;
    const sources = {};

    sources.adressen = await md5FetchText(
      prefix,
      gazetteerHost + "/data/3857/adressen.json"
    );
    sources.pois = await md5FetchText(
      prefix,
      gazetteerHost + "/data/3857/pois.json"
    );
    sources.kitas = await md5FetchText(
      prefix,
      gazetteerHost + "/data/3857/kitas.json"
    );

    const gazData = getGazDataForTopicIds(sources, topics);
    dispatch(setGazdata(gazData));
  };
};

// Destructure and export the plain action creators
export const { setGazdata } = slice.actions;
export const getGazData = (state) => state.gazetteerData.entries || [];
export default slice;
