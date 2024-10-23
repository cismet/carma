import { addSVGToProps } from 'react-cismap/tools/svgHelper';
import Color from 'color';
import { getColorForProperties } from './fromStadtplan';
import { getWegeartIcon } from './iconFactory';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
const shortenOnLinebreak = (
  text,
  maxLineLength = 320,
  overflowString = '...'
) => {
  if (!text) {
    return undefined;
  }
  const linebreakIndex = text.indexOf('\n');
  let additionalInfo;

  if (linebreakIndex > 0 && linebreakIndex < maxLineLength) {
    additionalInfo = text.substring(0, linebreakIndex);
  } else if (text.length > maxLineLength) {
    additionalInfo = text.substring(0, maxLineLength) + overflowString;
  } else {
    additionalInfo = text;
  }

  return additionalInfo;
};
const convertBPKlimaItemsToFeature = async (itemIn, poiColors) => {
  if (itemIn.typ === 'ort') {
    let item = await addSVGToProps(itemIn, (i) => i.thema.icon);
    const text = item?.standort?.name || 'Kein Standort';
    const type = 'Feature';
    const selected = false;
    const geometry = item?.standort?.geojson;
    // item.svg=DEFAULT_SVG.code;
    item.color = item?.thema.farbe;
    item.styleinfo = {};
    item.styleinfo.weight = 2;
    item.styleinfo.darkenFactor = 0.01;
    const info = {
      header: item.thema.name,
      title: text,
      additionalInfo: item?.beschreibung,
      subtitle: (
        <span>
          {item?.standort?.strasse} {item?.standort?.hausnummer}
          <br />
          {item?.standort?.plz} {item?.standort?.stadt}
        </span>
      ),
    };

    item.info = info;
    item.url = item?.website;
    if (item.bild) {
      item.foto =
        'https://www.wuppertal.de/geoportal/standort_klima/fotos/' + item.bild;
    }

    const f = {
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
      featuretype: 'ort',
    };
    return f;
  } else if (itemIn.typ === 'route') {
    let item = await addSVGToProps(itemIn, (i) => i.icon);
    //round distanz to 1 digit
    const dist = Math.round(item.distanz * 10) / 10;

    const additionalText = `An dieser Route befinden sich ${
      item?.routenpunkte?.length > 0 ? item?.routenpunkte?.length : 'keine'
    } ${item?.routenpunkte?.length === 1 ? 'Station' : 'Stationen'}.`;

    const additionalInfo = shortenOnLinebreak(item?.beschreibung, 320, '...');

    const info = {
      header: 'Klimaroute',
      title: (
        <span>
          {item?.name} <FontAwesomeIcon icon={getWegeartIcon(item?.wegeart)} />
        </span>
      ),
      additionalInfo:
        (additionalInfo ? additionalInfo + '\n' : '') + ' ' + additionalText,

      subtitle: (
        <span style={{ fontSize: '12px', fontWeight: 500, lineHeight: 1.2 }}>
          Schwierigkeit: {item?.schwierigkeitsgrad}
          <br />
          Distanz: {dist} km, Dauer: {item?.dauer}{' '}
          {item?.dauer === '1:00' ? 'Stunde' : 'Stunden'}
        </span>
      ), // style in span make it look like h6
    };

    item.info = info;
    const text = item?.name || '???';
    const type = 'Feature';
    const selected = false;
    const geometry = item?.geojsonPoly;
    item.color = '#92BE4D';
    const result = [];

    const route = {
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
      featuretype: 'route',
    };
    result.push(route);
    //check if route contains aussichtspunkte
    if (item.routenpunkte) {
      for (const rp of item.routenpunkte) {
        if (rp.typ === 'aussichtspunkt') {
          const rpWithIcon = await addSVGToProps(
            rp,
            (i) => 'Icon_Aussichtsturm_farbig.svg'
          );
          const aussichtspunkt = {
            featuretype: 'aussichtspunkt',

            text: rp.name,
            type: 'Feature',
            selected: false,
            geometry: rp.geom,
            crs: {
              type: 'name',
              properties: {
                name: 'urn:ogc:def:crs:EPSG::25832',
              },
            },
            properties: {
              ...rpWithIcon,
              color: '#655756',
              info: {
                header: 'Aussichtspunkt auf Klimaroute',
                title: rp?.name,
                additionalInfo: (feature) => {
                  //will be called as a function because the needed info is added later on
                  return `Von diesem Aussichtspunkt aus sehen Sie ${
                    feature?.properties?.angebote?.length
                  } Klimaort${
                    feature?.properties?.angebote?.length === 1 ? '' : 'e'
                  }.`;
                },
                subtitle: (
                  <span>
                    {item?.standort?.strasse} {item?.standort?.hausnummer}
                    <br />
                    {item?.standort?.plz} {item?.standort?.stadt}
                  </span>
                ),
              },
            },
          };

          result.push(aussichtspunkt);
          const aussichtsview = {
            featuretype: 'view',

            text: rp.name + ' (Blickfeld)',
            type: 'Feature',

            selected: false,
            preventSelection: true,
            geometry: rp.viewgeom,
            crs: {
              type: 'name',
              properties: {
                name: 'urn:ogc:def:crs:EPSG::25832',
              },
            },
            properties: { ...rpWithIcon, typ: 'blickfeld' },
          };
          result.push(aussichtsview);
        }
      }
    }
    return result;
  } else if (itemIn.typ === 'zwischenstopp') {
    let item = await addSVGToProps(
      itemIn,
      (i) => 'Klimaroute_Icon_Zwischenstopp_farbig.svg'
    );
    //item.svg = DEFAULT_SVG.code;
    const type = 'Feature';
    const selected = false;
    const geometry = item?.geojson;
    item.color = '#226c32';
    item.styleinfo = {};
    item.styleinfo.weight = 2;
    item.styleinfo.darkenFactor = 0.01;

    //set additionalInfo to the first 160 chars of beschreibung and add ...
    // check if there is a linebreak within the first 320 chars
    // if yes, set additional info to the first line
    let additionalInfo = '';

    additionalInfo = shortenOnLinebreak(item?.beschreibung);

    const text = item.name;
    const info = {
      header: 'Zwischenstopp',
      title: text,
      additionalInfo,
    };
    item.info = info;
    const f = {
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
      featuretype: 'zwischenstopp',
    };
    return f;
  } else if (itemIn.typ === 'poi') {
    let clonedItem = JSON.parse(JSON.stringify(itemIn));

    let item = await addSVGToProps(clonedItem, (i) => getSignature(i));
    const headerColor = Color(getColorForProperties(item, poiColors));
    const info = {
      header: (item?.mainlocationtype?.lebenslagen || []).join(', '),
      title: item.name,
      additionalInfo: item.info,
      subtitle: item?.adresse,
    };
    item.info = info;
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
      featuretype: 'poi',
    };
  } else {
    console.warn('unknown item type', itemIn);
  }
};

export default convertBPKlimaItemsToFeature;

const getSignature = (properties) => {
  if (properties.signatur) {
    return properties.signatur;
  } else if (properties.mainlocationtype.signatur) {
    return properties.mainlocationtype.signatur;
  }
  return 'Platz.svg'; //TODO sinnvoller default
};
