import Color from 'color';
import React from 'react';
import { addSVGToProps } from 'react-cismap/tools/svgHelper';

import { constants } from './constants';
import { convertPoint } from 'react-cismap/tools/gisHelper';

const getSignature = (properties) => {
  if (properties.signatur) {
    return properties.signatur;
  } else if (properties.mainlocationtype.signatur) {
    return properties.mainlocationtype.signatur;
  }
  return 'Platz.svg'; //TODO sinnvoller default
};

const convertItemToFeature = async (itemIn, poiColors) => {
  let clonedItem = JSON.parse(JSON.stringify(itemIn));

  // let item = await addSVGToProps(clonedItem, (i) => getSignature(i));
  // const headerColor = Color(getColorForProperties(item, poiColors));

  const info = {
    header: 'Ehrenamt',
    title: `Angebot Nr. ${itemIn.id}`,
    subtitle: itemIn.text,
  };

  // item.color = headerColor;

  const id = itemIn.id;
  const type = 'Feature';
  const selected = false;
  const point = convertPoint(itemIn.geo_x, itemIn.geo_y);
  const geometry = {
    type: 'Point',
    coordinates: [point[0], point[1]],
  };
  const text = itemIn.text;

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
    properties: { ...itemIn, info: info, inCart: false },
  };
};

export default convertItemToFeature;

export const getConvertItemToFeatureWithPOIColors = (poiColors) => {
  return async (itemIn) => {
    return await convertItemToFeature(itemIn, poiColors);
  };
};
