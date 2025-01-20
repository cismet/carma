import React from "react";
import IconComp from "react-cismap/commons/Icon";
import {
  fetchJSON,
  md5FetchJSON,
  md5FetchText,
} from "react-cismap/tools/fetching";
import { getGazDataForTopicIds } from "react-cismap/tools/gazetteerHelper";

import { host } from "./constants";

export const getGazData = async (setGazData) => {
  const urlPrefix = window.location.origin + window.location.pathname;

  const prefix = "GazDataForStarkregengefahrenkarteByCismet";
  const data = await md5FetchJSON(
    prefix,
    urlPrefix + "/data/adressen_saarlouis.json"
  );
  setGazData(data || []);

  setGazData(data);
};
