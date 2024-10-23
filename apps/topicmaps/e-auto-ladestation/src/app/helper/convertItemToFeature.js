import { addSVGToProps } from 'react-cismap/tools/svgHelper';
import Color from 'color';
import { getColorForProperties } from './styler';

const getSignature = (properties) => {
  return 'pikto_e-mobil.svg';
};

const convertItemToFeature = async (itemIn, poiColors) => {
  let clonedItem = JSON.parse(JSON.stringify(itemIn));

  let item = await addSVGToProps(
    clonedItem,
    (i) => getSignature(i),
    'https://wunda-geoportal.cismet.de/svgs/'
  );
  const headerColor = Color(getColorForProperties(item));

  const info = {
    header: `Ladestation für E-Autos (${item.online ? 'online' : 'offline'})`,
    title: itemIn.name,
    additionalInfo: itemIn.detailbeschreibung,
    subtitle: itemIn.strasse + ' ' + itemIn.hausnummer,
  };
  item.info = info;
  if (item.foto) {
    item.foto =
      'https://www.wuppertal.de/geoportal/emobil/autos/fotos/' + item.foto;
  }

  if (item.betreiber.email) {
    item.email = item.betreiber.email;
  }

  if (item.betreiber.telefon) {
    item.tel = item.betreiber.telefon;
  }

  if (item.betreiber.homepage) {
    item.url = item.betreiber.homepage;
  }

  item.color = headerColor;
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

export const getConvertItemToFeatureWithPOIColors = (poiColors) => {
  return async (itemIn) => {
    return await convertItemToFeature(itemIn, poiColors);
  };
};
