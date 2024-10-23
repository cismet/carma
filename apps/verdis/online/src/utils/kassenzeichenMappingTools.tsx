// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { getGeoJsonFeatureFromCidsObject } from './cidsTools';
import L from 'leaflet';
import proj4 from 'proj4';
import ColorHash from 'color-hash';
import { get } from 'lodash';
import getArea from '@turf/area';
import { reproject } from 'reproject';

import { getMergedFlaeche, getCRsForFeature } from './kassenzeichenHelper';
import area from '@turf/area';
export const projectionData = {
  '25832': {
    def: '+proj=utm +zone=32 +ellps=GRS80 +units=m +no_defs',
    geojson: {
      type: 'name',
      properties: {
        name: 'urn:ogc:def:crs:EPSG::25832',
      },
    },
  },
  '4326': {
    def: '+proj=longlat +ellps=WGS84 +datum=WGS84 +no_defs',
    geojson: {
      type: 'name',
      properties: {
        name: 'urn:ogc:def:crs:EPSG::4326',
      },
    },
  },
};

export const getWGS84GeoJSON = (geoJSON) => {
  try {
    const reprojectedGeoJSON = reproject(
      geoJSON,
      projectionData['25832'].def,
      proj4.WGS84
    );

    return reprojectedGeoJSON;
  } catch (e) {
    console.log('excepotion reproject', e);
    return undefined;
  }
};

export const getArea25832 = (geoJSON) => {
  const wGS84GeoJSON = getWGS84GeoJSON(geoJSON);
  if (wGS84GeoJSON !== undefined) {
    return getArea(wGS84GeoJSON);
  }
};

export const getFlaecheFeaturePropertiesFromCidsFlaeche = (flaeche) => {
  return {
    id: flaeche.id,
    bez: flaeche.flaechenbezeichnung,
    art_abk: flaeche.flaecheninfo.flaechenart.art_abkuerzung,
    flaechenart: flaeche.flaecheninfo.flaechenart.art,
    anschlussgrad: flaeche.flaecheninfo.anschlussgrad.grad_abkuerzung,
    groesse: flaeche.flaecheninfo.groesse_aus_grafik,
    groesse_korrektur: flaeche.flaecheninfo.groesse_korrektur,
  };
};

export const getFlaechenFeatureCollection = (kassenzeichen) => {
  const geojson = getGeoJsonFeatureFromCidsObject(
    kassenzeichen.flaechen,
    'flaecheninfo.geometrie',
    getFlaecheFeaturePropertiesFromCidsFlaeche
  );
  return geojson;
};

export const getAnnotationFeatureCollection = (aenderungsanfrage) => {
  const geojson: any = [];

  if (
    aenderungsanfrage !== null &&
    aenderungsanfrage !== undefined &&
    aenderungsanfrage.geometrien !== undefined &&
    aenderungsanfrage.geometrien !== null
  ) {
    const keys = Object.keys(aenderungsanfrage.geometrien);
    for (const key of keys) {
      const feature = JSON.parse(
        JSON.stringify(aenderungsanfrage.geometrien[key])
      );
      feature.properties.type = 'annotation';
      feature.crs = {
        type: 'name',
        properties: { name: 'urn:ogc:def:crs:EPSG::25832' },
      };
      // feature.properties.id = feature.properties.id;
      if (feature.geometry.type === 'Polygon') {
        if (area(feature) > 0) {
          geojson.push(feature);
        }
      } else {
        geojson.push(feature);
      }
    }
  }

  // console.log('geojson', geojson, JSON.stringify(geojson));

  return geojson;
};

export const getFrontenFeatureCollection = (kassenzeichen) => {
  return getGeoJsonFeatureFromCidsObject(
    kassenzeichen.fronten,
    'frontinfo.geometrie',
    (front) => {
      return {
        id: front.id,
        key: get(front, 'frontinfo.lage_sr.sr_klasse.key', ''),
        laenge: get(front, 'frontinfo.laenge_korrektur', 0),
        strasse: get(front, 'frontinfo.strasse.name', '-'),
      };
    }
  );
};

export const getKassenzeichenInfoFeatureCollection = (kassenzeichen) => {
  return getGeoJsonFeatureFromCidsObject(
    kassenzeichen.kassenzeichen_geometrien,
    'geometrie',
    (kasz_geom) => {
      return {
        id: kasz_geom.id,
        name: kasz_geom.name,
        istfrei: kasz_geom.istfrei,
        geomstring: kasz_geom.geometrie.geo_field,
      };
    }
  );
};

export const getColorFromFlaechenArt = (art_abk) => {
  let color = '#ff0000';
  switch (art_abk) {
    case 'DF':
    case 'Dachfläche':
      color = '#a24c29';
      break;
    case 'GDF':
    case 'Gründach':
      color = '#6a7a17';
      break;
    case 'VF':
    case 'versiegelte Fläche':
      color = '#788180';
      break;
    case 'VFS':
    case 'städtische Straßenfläche':
      color = '#8a8684';
      break;
    case 'LVS':
    case 'leicht versiegelte Straßenfläche':
      color = '#7e5b47';
      break;
    case 'LVF':
    case 'leicht versiegelte Fläche':
      color = '#9f9b6c';
      break;
    case 'VV':
    case 'vorläufige Veranlagung':
      color = '#ff0000';
      break;
    default:
      color = '#ff0000';
  }
  return color;
};

export const getColorFromFrontKey = (key) => {
  if (key) {
    switch (key) {
      case 'C1':
      case 'C2':
        return '#4ecdc4';
      default:
        return '#F38630'; //orange
    }
  } else {
    return '#0D6759'; //green
  }
};

export const getColorForFront = (frontDesc) => {
  let colorHash = new ColorHash({ saturation: 0.3 });
  return colorHash.hex('' + frontDesc + '1234567890');
};

export const getColorForKassenzeichenGeometry = (geo_field) => {
  let colorHash = new ColorHash({ saturation: 0.4 });
  return colorHash.hex('' + geo_field);
};

export const createFlaechenStyler = (changeRequestsEditMode, kassenzeichen) => {
  return (feature) => {
    if (feature.properties.type === 'annotation') {
      // const currentColor = '#ffff00';

      let opacity,
        lineColor,
        fillColor = '#B90504',
        markerColor,
        weight = 2,
        fillOpacity;

      if (feature.selected === true) {
        opacity = 0.9;
        lineColor = '#0C7D9D';
        fillOpacity = 0.8;
        markerColor = 'blue';
      } else {
        opacity = 1;
        fillOpacity = 0.6;
        lineColor = '#990100';
        markerColor = 'red';
      }

      return {
        color: lineColor,
        radius: 8,
        weight,
        opacity,
        fillColor,
        fillOpacity,
        className: 'annotation-' + feature.id,
        defaultMarker: true,

        customMarker: L.ExtraMarkers.icon({
          icon: feature.inEditMode === true ? 'fa-square' : undefined,
          markerColor,
          shape: 'circle',
          prefix: 'fa',
          number: 'X',
        }),
      };
    } else {
      let color;
      if (changeRequestsEditMode === false) {
        color = getColorFromFlaechenArt(feature.properties.art_abk);
      } else {
        let cr = getCRsForFeature(kassenzeichen, feature.properties);
        let mergedFlaeche = getMergedFlaeche(feature.properties, cr);
        color = getColorFromFlaechenArt(mergedFlaeche.art_abk);
      }
      let opacity = 0.6;
      let linecolor = '#000000';
      let weight = 1;

      if (feature.selected === true) {
        opacity = 0.9;
        linecolor = '#0C7D9D';
        weight = 2;
      }
      const style = {
        color: linecolor,
        weight: weight,
        opacity: 1.0,
        fillColor: color,
        fillOpacity: opacity,
        className: 'verdis-flaeche-' + feature.properties.bez,
      };
      return style;
    }
  };
};

export const kassenzeichenGeometrienStyle = (feature) => {
  let color = getColorForKassenzeichenGeometry(feature.properties.geomstring);
  let opacity = 0.6;
  let linecolor = '#000000';
  let weight = 1;

  if (feature.selected === true) {
    opacity = 0.9;
    linecolor = '#0C7D9D';
    weight = 2;
  }

  const style = {
    color: linecolor,
    weight: weight,
    opacity: 1.0,
    fillColor: color,
    fillOpacity: opacity,
  };

  return style;
};

export const frontenStyle = (feature) => {
  let linecolor = getColorFromFrontKey(feature.properties.key);
  let opacity = 0.6;
  let weight = 10;

  if (feature.selected === true) {
    opacity = 0.9;
    linecolor = '#0C7D9D';
    weight = 10;
  }

  const style = {
    color: linecolor,
    weight: weight,
    opacity: opacity,
  };

  return style;
};

export const flaechenLabeler = (feature) => {
  return (
    <h5 style={getStyleFromFeatureConsideringSelection(feature)}>
      {feature.properties.bez}
    </h5>
  );
};

const getStyleFromFeatureConsideringSelection = (feature) => {
  let base = {
    color: 'blue',
    //   "textShadow": "1px 1px 0px  #000000,-1px 1px 0px  #000000, 1px -1px 0px  #000000, -1px -1px 0px  #000000, 2px 2px 15px #000000",
  };
  if (feature.selected) {
    const radius = 10;
    const borderDef = `${radius}px ${radius}px ${radius}px ${radius}px`;
    return {
      ...base,
      background: 'rgba(67, 149, 254, 0.8)',
      WebkitBorderRadius: borderDef,
      MozBorderRadius: borderDef,
      borderRadius: borderDef,
      padding: '5px',
      defaultMarker: true,
    };
  } else {
    return base;
  }
};

export const getMarkerStyleFromFeatureConsideringSelection = (feature) => {
  let opacity = 0.6;
  let linecolor = '#000000';
  let weight = 1;

  if (feature.selected === true) {
    opacity = 0.9;
    linecolor = '#0C7D9D';
    weight = 2;
  }
  let text, yTextPos;
  if (feature.properties.type === 'annotation') {
    text = feature.properties.name;
  } else {
    text = feature.properties.bez;
  }
  // if (feature.properties.type === 'annotation') {
  // 	if (feature.geometry.type === 'Point') {
  // 		yTextPos = 20;
  // 	} else {
  // 		yTextPos = 10;
  // 	}
  // } else {
  // 	yTextPos = 10;
  // }
  yTextPos = 15;
  if (feature.properties.type === 'annotation') {
    if (feature.geometry.type === 'Point') {
      yTextPos = 20;
    }
  }

  const style = {
    radius: 10,
    color: linecolor,
    weight: weight,
    opacity: 1.0,
    fillOpacity: opacity,
    svgSize: 30,
    className: 'verdis-flaeche-marker-' + feature.properties.bez,
    svg: `<svg interactive="false" height="30" width="30" skipstyle="background-color:green;" >
        <style>
            .flaeche { font: bold 16px sans-serif; }
        </style>

        <text x="15" y="${yTextPos}" vertical-align="middle" class="flaeche" text-anchor="middle" alignment-baseline="central" fill="#0B486B">${text}</text>
      </svg>`,
  };

  return style;
};

export default {};
