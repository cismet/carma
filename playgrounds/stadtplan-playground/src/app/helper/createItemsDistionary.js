import { predicateBy } from "react-cismap/tools/stringHelper";

const createItemsDictionary = (items) => {
  const lebenslagenSet = new Set();
  const poitypesArr = [];

  for (let poi of items) {
    // poi.point25832 = convertPoint(poi.geo_x, offer.geo_y) zuesrt mainlocationtype
    if (poi.mainlocationtype) {
      let type = poi.mainlocationtype;
      for (let ll of type.lebenslagen) {
        lebenslagenSet.add(ll);
      }
      let found = poitypesArr.find((x) => x.id === type.id);
      if (!found) {
        poitypesArr.push(type);
      }
    }
  }

  const poiTypes = Array.from(poitypesArr).sort(predicateBy("name"));
  const lebenslagen = Array.from(lebenslagenSet).sort();

  return { poiTypes, lebenslagen };
};

export default createItemsDictionary;
