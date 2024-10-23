import { addSVGToProps } from 'react-cismap/tools/svgHelper';
import Color from 'color';
import { getColorForProperties } from './styler';

const getSignature = (properties) => {
  if (properties.typ === 'Verleihstation') {
    return 'pikto_e-bike_verleih.svg';
  } else {
    // return 'pikto_e-bike_verleih.svg';
    return 'pikto_e-bike_laden.svg';
  }
};

const convertItemToFeature = async (itemIn) => {
  let clonedItem = JSON.parse(JSON.stringify(itemIn));

  let ebike = await addSVGToProps(
    clonedItem,
    (i) => getSignature(i),
    'https://wunda-geoportal.cismet.de/svgs/'
  );
  const headerColor = Color(getColorForProperties(ebike));

  let onlineStatus = '';

  if (ebike.online) {
    onlineStatus = `(${ebike.online ? 'online' : 'offline'})`;
  }

  const header = `${ebike.typ} ${
    ebike.typ === 'Ladestation' ? 'für' : 'von'
  } E-Fahrräder${ebike.typ === 'Ladestation' ? '' : 'n'} ${onlineStatus}`;

  const info = {
    header: header,
    title: ebike.standort,
    additionalInfo: ebike.zusatzinfo,
    subtitle: ebike.strasse + ' ' + ebike.hausnummer,
  };

  if (ebike?.betreiber) {
    if (ebike.betreiber.email) {
      ebike.email = ebike.betreiber.email;
    }

    if (ebike.betreiber.telefon) {
      ebike.tel = ebike.betreiber.telefon;
    }

    if (ebike.betreiber.web) {
      ebike.url = ebike.betreiber.web;
    }
  }

  if (ebike.telefon) {
    ebike.tel = ebike.telefon;
  }

  if (ebike.homepage) {
    ebike.url = ebike.homepage;
  }

  ebike.color = headerColor;
  ebike.info = info;
  const id = ebike.id;
  const type = 'Feature';
  const selected = false;
  const geometry = ebike.geojson;
  const text = ebike.typ === 'Ladestation' ? ebike.standort : ebike.standort;

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
    properties: ebike,
  };
};

export default convertItemToFeature;
