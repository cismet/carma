import { predicateBy } from 'react-cismap/tools/stringHelper';

const createItemsDictionary = (items) => {
  const lebenslagenSet = new Set();
  let veranstaltungsartenSet = new Set();
  const poitypesArr: any = [];

  for (let poi of items) {
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

    if (poi.more && poi.more.veranstaltungsarten) {
      for (let va of poi.more.veranstaltungsarten) {
        veranstaltungsartenSet.add(va);
      }
    }
  }

  const poiTypes = Array.from(poitypesArr).sort(predicateBy('name'));
  const lebenslagen = Array.from(lebenslagenSet).sort();
  const veranstaltungsarten = Array.from(veranstaltungsartenSet).sort();

  return { poiTypes, lebenslagen, veranstaltungsarten };
};

export default createItemsDictionary;
