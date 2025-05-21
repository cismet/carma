import { md5FetchText } from "react-cismap/tools/fetching";
import { getGazDataForTopicIds } from "react-cismap/tools/gazetteerHelper";

const host = import.meta.env.VITE_WUPP_ASSET_BASEURL;
export const getGazData = async (setGazData) => {
  const prefix = "GazData";
  const sources = {};

  sources.adressen = await md5FetchText(prefix, host + "/data/adressen.json");
  sources.bezirke = await md5FetchText(prefix, host + "/data/bezirke.json");
  sources.quartiere = await md5FetchText(prefix, host + "/data/quartiere.json");
  sources.pois = await md5FetchText(prefix, host + "/data/pois.json");
  sources.kitas = await md5FetchText(prefix, host + "/data/kitas.json");
  sources.no2 = await md5FetchText(prefix, host + "/data/no2.json");

  const gazData = getGazDataForTopicIds(sources, [
    "no2",
    "pois",
    "kitas",
    "bezirke",
    "quartiere",
    "adressen",
  ]);

  setGazData(gazData);
};
