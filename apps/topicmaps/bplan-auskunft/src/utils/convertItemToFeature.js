import {
  INFO_DOC_DATEINAMEN_NAME,
  INFO_DOC_DATEINAMEN_URL,
} from '../constants/bplaene';

const convertItemToFeature = async (itemIn, poiColors) => {
  let clonedItem = JSON.parse(JSON.stringify(itemIn));

  let item = clonedItem;
  const id = item.nummer;
  const type = 'Feature';
  const featuretype = 'B-Plan';
  const selected = false;
  const geometry = item.geojson;

  const text = item.nummer;

  if (item.docs.length > 0) {
    item.docs = [
      {
        file: INFO_DOC_DATEINAMEN_NAME,
        url: INFO_DOC_DATEINAMEN_URL,
      },
    ].concat(item.docs);
  }

  return {
    id,
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
    properties: item,
  };
};

export default convertItemToFeature;
