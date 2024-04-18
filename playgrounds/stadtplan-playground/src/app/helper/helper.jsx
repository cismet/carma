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
  const prefix = "GazData";
  const sources = {};

  sources.adressen = await md5FetchText(prefix, host + "/data/adressen.json");
  sources.bezirke = await md5FetchText(prefix, host + "/data/bezirke.json");
  sources.quartiere = await md5FetchText(prefix, host + "/data/quartiere.json");
  sources.pois = await md5FetchText(prefix, host + "/data/pois.json");
  sources.kitas = await md5FetchText(prefix, host + "/data/kitas.json");

  const gazData = getGazDataForTopicIds(sources, [
    "pois",
    "kitas",
    "bezirke",
    "quartiere",
    "adressen",
  ]);

  setGazData(gazData);
};

export const getPOIColors = async (setPoiColors) => {
  md5FetchJSON("poi_colors", host + "/data/poi.farben.json").then((data) => {
    setPoiColors(data);
  });
};

export const fotoKraemerUrlManipulation = (input) => {
  if (input !== undefined || input === "") {
    const ret = input.replace(
      /https*:\/\/.*fotokraemer-wuppertal\.de/,
      "https://wunda-geoportal-fotos.cismet.de/"
    );
    // console.log('converted url from ', input);
    // console.log('converted url to ', ret);
    return ret;
  } else {
    return undefined;
  }
};

export const fotoKraemerCaptionFactory = (linkUrl) => (
  <a href={linkUrl} target="_fotos">
    <IconComp name="copyright" /> Peter Kr&auml;mer - Fotografie
  </a>
);
