import bbox from '@turf/bbox';
import bboxPolygon from '@turf/bbox-polygon';
import proj4 from 'proj4';
import L from 'leaflet';
import ColorHash from 'color-hash';
import { reproject } from 'reproject';
import { projectionData } from 'react-cismap/constants/gis';
import { concat, flatten } from 'lodash';

export const LandParcelColors = [
  '#2956B2',
  '#659CEF',
  '#7DBD00',
  '#DCF600',
  '#FF5B00',
];

export const createFeatureArray = (data) => {
  const result = [];

  data.kassenzeichen.forEach((item, index) => {
    item.flaechenArray.forEach((flaeche) => {
      const feature = {
        type: 'Feature',
        featureType: 'flaeche',
        id: flaeche.flaecheObject.flaecheninfoObject.id,
        flaecheId: flaeche.flaecheObject.id,
        hovered: false,
        weight: 0.5,
        properties: {
          kassenzeichen: item.kassenzeichennummer8,
          anschlussgrad:
            flaeche.flaecheObject.flaecheninfoObject.anschlussgradObject.grad,
          bezeichnung: flaeche.flaecheObject.flaechenbezeichnung,
        },
        geometry: {
          type: 'Polygon',
          coordinates: [],
        },
        crs: {
          type: 'name',
          properties: {
            name: 'urn:ogc:def:crs:EPSG::25832',
          },
        },
      };

      let coordinates = [];
      coordinates = concat(
        coordinates,
        flatten(
          flaeche.flaecheObject.flaecheninfoObject.geom.geo_field.coordinates
        )
      );
      feature.geometry.coordinates = [coordinates];
      result.push(feature);
    });

    item.frontenArray.forEach((front) => {
      const feature = {
        type: 'Feature',
        featureType: 'front',
        id: front.frontObject.frontinfoObject.id,
        hovered: false,
        weight: 8,
        properties: {
          kassenzeichen: item.kassenzeichennummer8,
          bezeichnung: front.frontObject.nummer,
        },
        geometry: {
          type: 'LineString',
          coordinates: [],
        },
        crs: {
          type: 'name',
          properties: {
            name: 'urn:ogc:def:crs:EPSG::25832',
          },
        },
      };

      let coordinates = [];
      coordinates = concat(
        coordinates,
        front.frontObject.frontinfoObject.geom.geo_field.coordinates
      );
      feature.geometry.coordinates = coordinates;
      result.push(feature);
    });

    item.kassenzeichen_geometrienArray.forEach((geometry) => {
      const feature = {
        type: 'Feature',
        featureType: 'general',
        id: geometry.kassenzeichen_geometrieObject.id,
        geomId: geometry.id,
        hovered: false,
        weight: 0.5,
        properties: {
          kassenzeichen: item.kassenzeichennummer8,
          bezeichnung: geometry.kassenzeichen_geometrieObject.name,
        },
        geometry: {
          type: 'Polygon',
          coordinates: [],
        },
        crs: {
          type: 'name',
          properties: {
            name: 'urn:ogc:def:crs:EPSG::25832',
          },
        },
      };

      let coordinates = [];
      coordinates = concat(
        coordinates,
        flatten(
          geometry.kassenzeichen_geometrieObject.geom.geo_field.coordinates
        )
      );
      feature.geometry.coordinates = [coordinates];
      result.push(feature);
    });
  });

  return result;
};

export const createQueryGeomFromBB = (boundingBox) => {
  const geom = bboxPolygon([
    boundingBox.left,
    boundingBox.top,
    boundingBox.right,
    boundingBox.bottom,
  ]).geometry;
  geom.crs = {
    type: 'name',
    properties: {
      name: 'urn:ogc:def:crs:EPSG::25832',
    },
  };
  const reprojectedGeoJSON = reproject(
    {
      type: 'Feature',
      geometry: geom,
      properties: {},
    },
    projectionData['3857'].def,
    projectionData['25832'].def
  );
  const updatedGeom = reprojectedGeoJSON.geometry;
  updatedGeom.crs = {
    type: 'name',
    properties: {
      name: 'urn:ogc:def:crs:EPSG::25832',
    },
  };

  return updatedGeom;
};

// export const fitFeatureArray = (featureArray, mapRef) => {
//   const bounds = getBoundsForFeatureArray(featureArray);

//   //ugly winning to avoid some race condition
//   setTimeout(() => {
//     mapRef.current.leafletMap.leafletElement.fitBounds(bounds);
//   }, 1000);
// };

export const getBoundsForFeatureArray = (featureArray) => {
  // Convert your featureArray into a FeatureCollection
  const featureCollection = {
    type: 'FeatureCollection',
    features: featureArray,
  };
  return getBoundsForFeatureCollection(featureCollection);
};

export const convertLatLngToXY = (latlng) => {
  const xy = proj4('EPSG:4326', 'EPSG:25832', [latlng.lng, latlng.lat]);
  return xy;
};

export const getBoundsForFeatureCollection = (featureCollection) => {
  // Get bbox in EPSG:3857 from Turf.js
  const boundingBox3857 = bbox(featureCollection);

  // Convert the bounding box from EPSG:3857 to EPSG:4326
  const southWest4326 = proj4('EPSG:25832', 'EPSG:4326', [
    boundingBox3857[0],
    boundingBox3857[1],
  ]);
  const northEast4326 = proj4('EPSG:25832', 'EPSG:4326', [
    boundingBox3857[2],
    boundingBox3857[3],
  ]);

  // Return Leaflet LatLngBounds
  return L.latLngBounds(
    L.latLng(southWest4326[1], southWest4326[0]), // southwest corner
    L.latLng(northEast4326[1], northEast4326[0]) // northeast corner
  );
};

export function convertBBox2Bounds(bbox, refDef = proj4crs25832def) {
  const projectedNE = proj4(refDef, proj4.defs('EPSG:4326'), [
    bbox[0],
    bbox[1],
  ]);
  const projectedSW = proj4(refDef, proj4.defs('EPSG:4326'), [
    bbox[2],
    bbox[3],
  ]);
  return [
    [projectedNE[1], projectedSW[0]],
    [projectedSW[1], projectedNE[0]],
  ];
}
export const getCenterAndZoomForBounds = (map, bounds) => {
  const center = bounds.getCenter();
  const zoom = map.getBoundsZoom(bounds); // Returns the maximum zoom level on which the given bounds fit to the map view in its entirety. If inside is set to true, it instead returns the minimum zoom level on which the map view fits into the given bounds in its entirety.
  return { center, zoom };
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

export const createStyler = (changeRequestsEditMode, kassenzeichen) => {
  return (feature) => {
    if (feature.properties.type === 'annotation') {
      //will be used later
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
      switch (feature.featureType) {
        case 'flaeche': {
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
            weight = '2';
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
        case 'front': {
          return frontenStyle(feature);
        }

        case 'general':
          return kassenzeichenGeometrienStyle(feature);
        case 'befreiung':
          const style = {
            color: '#005F6B',
            weight: 1,
            opacity: 0.6,
            fillColor: '#26ADE4',
            fillOpacity: 0.6,
            className: 'verdis-befreiung-' + feature.properties.id,
          };
          return style;

        default:
          break;
      }
    }
  };
};

export const kassenzeichenGeometrienStyle = (feature) => {
  // let color = getColorForKassenzeichenGeometry(
  //   //JSON.stringify(feature.geometry)
  //   feature.properties.id
  // );
  const color =
    LandParcelColors[feature.properties.id % LandParcelColors.length];
  let opacity = 0.6;
  let linecolor = '#000000';
  let weight = 1;

  if (feature.selected === true) {
    opacity = 0.9;
    linecolor = '#0C7D9D';
    weight = '2';
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
  let linecolor = getColorFromFrontKey(
    feature?.properties?.lage_sr_satzung?.strassenreinigung?.key
  );
  let opacity = 0.6;
  let weight = 10;

  if (feature.selected === true) {
    opacity = 0.9;
    linecolor = '#0C7D9D';
    weight = '10';
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
    weight = '2';
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
