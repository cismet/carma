import { addSVGToProps } from 'react-cismap/tools/svgHelper';
import Color from 'color';
import { getColorForProperties, getHeaderTextForProperties } from './styler';

const getSignature = (properties) => {
  if (properties.signatur) {
    return properties.signatur;
  } else if (properties.mainlocationtype.signatur) {
    return properties.mainlocationtype.signatur;
  }
  return 'Platz.svg';
};

const convertItemToFeature = async (itemIn) => {
  let clonedItem = JSON.parse(JSON.stringify(itemIn));

  let item = await addSVGToProps(clonedItem, (i) => getSignature(i));
  const headerColor = Color(getColorForProperties(item));

  const header = getHeaderTextForProperties(item);

  const info = {
    header: header,
    title: item.name,
    additionalInfo: clonedItem.info,
    subtitle: item.adresse,
  };

  if (item?.betreiber) {
    if (item.betreiber.email) {
      item.email = item.betreiber.email;
    }

    if (item.betreiber.telefon) {
      item.tel = item.betreiber.telefon;
    }

    if (item.betreiber.homepage) {
      item.url = item.betreiber.homepage;
    }
  }

  if (item.telefon) {
    item.tel = item.telefon;
  }

  if (item.homepage) {
    item.url = item.homepage;
  }

  if (item.wup_live_url) {
    item.genericLinks = [
      {
        url: item.wup_live_url,
        tooltip: 'Programm anzeigen',
        target: 'wupplive',
        iconname: 'calendar',
      },
    ];
  }

  item.color = headerColor;
  item.info = info;
  const id = item.id;
  const type = 'Feature';
  const selected = false;
  const geometry = item.geojson;
  const text = item.name;

  return {
    id,
    text,
    type,
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
