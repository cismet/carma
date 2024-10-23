import { MappingConstants } from 'react-cismap';
import CismapLayer from 'react-cismap/CismapLayer';
import { REST_SERVICE_WUNDA } from '../../constants/verdis';
import { concat, flatten } from 'lodash';
import { reproject } from 'reproject';
import { projectionData } from 'react-cismap/constants/gis';
import proj4 from 'proj4';
import getArea from '@turf/area';
import { useDispatch } from 'react-redux';
import { searchForKassenzeichen } from '../../store/slices/search';
import { useSearchParams } from 'react-router-dom';

const getWGS84GeoJSON = (geoJSON) => {
  try {
    const reprojectedGeoJSON = reproject(
      geoJSON,
      projectionData['25832'].def,
      proj4.WGS84
    );

    return reprojectedGeoJSON;
  } catch (e) {
    return undefined;
  }
};

const getArea25832 = (geoJSON) => {
  const wGS84GeoJSON = getWGS84GeoJSON(geoJSON);

  if (wGS84GeoJSON !== undefined) {
    return getArea(wGS84GeoJSON);
  }
};

const omniAwareFeatureClickHandler = ({
  dispatch,
  urlParams,
  setUrlParams,
}) => {
  return (e) => {
    if (e.originalEvent.detail === 2) {
      const kassenzeichen = e.sourceTarget.feature.properties.kassenzeichen;
      console.log(
        'doubleclick',
        kassenzeichen,

        dispatch
      );
      dispatch(
        searchForKassenzeichen(String(kassenzeichen), urlParams, setUrlParams)
      );
    }
  };
};
const createKassenzeichenFlaechenFeatureArray = (data) => {
  const result = [];
  data.kassenzeichen.forEach((kassenzeichen) => {
    kassenzeichen.flaechenArray.forEach((f) => {
      const flaeche = f.flaecheObject;
      try {
        const feature = {
          type: 'Feature',
          featureType: 'flaeche',
          id:
            kassenzeichen.kassenzeichennummer8 +
            '_' +
            flaeche.flaechenbezeichnung,
          hovered: false,
          weight: 0.5,
          geometry: flaeche.flaecheninfoObject.geom.geo_field,
          properties: {
            kassenzeichen: kassenzeichen.kassenzeichennummer8,
            bezeichnung: flaeche.flaechenbezeichnung,
            anschlussgrad: flaeche.flaecheninfoObject.anschlussgradObject.grad,
          },
          crs: {
            type: 'name',
            properties: {
              name: 'urn:ogc:def:crs:EPSG::25832',
            },
          },
        };
        result.push(feature);
      } catch (e) {
        console.log('xxx error', e);
      }
    });
  });
  return result;
};
const createKassenzeichenInfoFlaechenFeatureArray = (data) => {
  const result = [];
  data.kassenzeichen.forEach((kassenzeichen) => {
    kassenzeichen.kassenzeichen_geometrienArray.forEach((f) => {
      const infoflaeche = f.kassenzeichen_geometrieObject;
      try {
        const feature = {
          type: 'Feature',
          featureType: 'infoflaeche',
          id: kassenzeichen.kassenzeichennummer8,
          hovered: false,
          weight: 0.5,
          geometry: infoflaeche.geom.geo_field,
          properties: {
            kassenzeichen: kassenzeichen.kassenzeichennummer8,
            bezeichnung: infoflaeche.name,
          },
          crs: {
            type: 'name',
            properties: {
              name: 'urn:ogc:def:crs:EPSG::25832',
            },
          },
        };
        result.push(feature);
      } catch (e) {
        console.log('xxx error', e);
      }
    });
  });
  return result;
};
const createKassenzeichenFrontenFeatureArray = (data) => {
  const result = [];
  data.kassenzeichen.forEach((kassenzeichen) => {
    kassenzeichen.frontenArray.forEach((f) => {
      const front = f.frontObject;
      try {
        const feature = {
          type: 'Feature',
          featureType: 'front',
          id: kassenzeichen.kassenzeichennummer8 + '_' + front.nummer,
          hovered: false,
          weight: 0.5,
          geometry: front.frontinfoObject.geom.geo_field,
          properties: {
            kassenzeichen: kassenzeichen.kassenzeichennummer8,
            bezeichnung: front.nummer,
          },
          crs: {
            type: 'name',
            properties: {
              name: 'urn:ogc:def:crs:EPSG::25832',
            },
          },
        };
        result.push(feature);
      } catch (e) {
        console.log('xxx error', e);
      }
    });
  });
  return result;
};
export const configuration = {
  bplan: {
    initialActive: false,
    title: 'BPläne',
    conf: {
      type: 'wmts',
      url: 'http://s10221.wuppertal-intra.de/bebauungsplanung/services',
      layers: 'bverfahren-r',
      version: '1.1.1',
      tileSize: 256,
      transparent: true,
      format: 'image/png',
    },
  },
  baulastnachweis: {
    initialActive: false,
    title: 'Baulastnachweise',
    conf: {
      type: 'wmts',
      url: 'http://s10221.wuppertal-intra.de:8056/baulasten/services',
      layers: 'baul',
      version: '1.1.1',
      tileSize: 256,
      transparent: true,
      format: 'image/png',
      pane: 'additionalLayers1',
    },
  },
  hausnummern: {
    initialActive: false,
    title: 'Hausnummern',
    conf: {
      type: 'wmts',
      url: 'http://s10221.wuppertal-intra.de:7098/alkis/services',
      layers: 'hausnr,hausnrne,hausnrplm,hausnrplo',
      version: '1.1.1',
      tileSize: 256,
      transparent: true,
      format: 'image/png',
    },
  },
  stadtFstck: {
    initialActive: false,
    title: 'Städt. Flurstücke',
    conf: {
      type: 'wmts',
      url: 'http://s10221.wuppertal-intra.de:7098/stadt-flurstuecke/services',
      layers: 'stadt_flurst',
      version: '1.1.1',
      tileSize: 256,
      transparent: true,
      format: 'image/png',
      pane: 'additionalLayers1',
    },
  },
  eswReinigungsklassen: {
    initialActive: false,
    title: 'Reinigungsklassen',
    conf: {
      type: 'wmts',
      url: 'http://s10221.wuppertal-intra.de:8099/esw/services',
      layers: 'esw',
      version: '1.1.1',
      tileSize: 256,
      transparent: true,
      format: 'image/png',
    },
  },
  hohenlinien: {
    initialActive: false,
    title: '1m Höhenlinien',
    conf: {
      type: 'wmts',
      url: 'http://s10221.wuppertal-intra.de:7098/hoehen/services',
      layers: 'hoehenu',
      styles: 'sepia',
      version: '1.1.1',
      tileSize: 256,
      transparent: true,
      format: 'image/png',
    },
  },
  expresskarte: {
    initialActive: false,
    title: 'Expresskarte (s/w)',
    conf: {
      type: 'wmts',
      url: 'http://s10221.wuppertal-intra.de:7098/alkis/services',
      layers: 'expsw',
      version: '1.1.1',
      tileSize: 256,
      transparent: true,
      format: 'image/png',
    },
  },
  expresskarteGelb: {
    initialActive: false,
    title: 'Expresskarte (gelb)',
    conf: {
      type: 'wmts',
      url: 'http://s10221.wuppertal-intra.de:7098/alkis/services',
      layers: 'expg',
      version: '1.1.1',
      tileSize: 256,
      transparent: true,
      format: 'image/png',
    },
  },
  kanal: {
    initialActive: false,
    title: 'Kanäle',
    conf: {
      type: 'vector',
      style: 'https://omt.map-hosting.de/styles/kanal/style.json',
      pane: 'additionalLayers1',
      offlineAvailable: false,
      offlineDataStoreKey: 'kanal',
    },
  },
  // kanaldaten: {
  //   initialActive: false,
  //   title: "Kanaldaten",
  //   conf: {
  //     type: "wmts",
  //     url: "http://s10221.wuppertal-intra.de:7098/alkis/services",
  //     layers: "expg",
  //     version: "1.1.1",
  //     tileSize: 256,
  //     transparent: true,
  //     format: "image/png",
  //   },
  // },

  versiegelteFlaechen: {
    virtual: true,
    conf: {
      type: 'graphql',
      pane: 'additionalLayers2',
      referenceSystemDefinition: MappingConstants.proj4crs3857def,
      query: `
      query geoFields($bbPoly: geometry) {
        kassenzeichen(where: {flaechenArray: {flaecheObject: {flaecheninfoObject: {geom: {geo_field: {_st_intersects: $bbPoly}}}}}}) {
          kassenzeichennummer8
          flaechenArray {
            flaecheObject {
              id
              flaechenbezeichnung
              flaecheninfoObject {
                geom {
                  geo_field
                }
                id
                anschlussgradObject {
                  grad
                }
              }
            }
          }
        }
      }`,
      endpoint: REST_SERVICE_WUNDA + '/graphql/VERDIS_GRUNDIS/execute',
      fetchAllowed: (bbPoly) => {
        const area = getArea25832(bbPoly);
        const maxAreaForSearch = 130000;

        return area < maxAreaForSearch && area !== 0;
      },
      style: {
        pane: 'additionalLayers2', //you can set a pane here
        color: '#66666666',
        fillColor: '#28282866',
        weight: 0.5,
      },
      hoveredStyle: {
        color: '#66666666',
        fillColor: '#66666666',
        weight: 1,
      },
      omniAwareFeatureClickHandler,
      useHover: true,
      createFeature: createKassenzeichenFlaechenFeatureArray,
      // ---- Events ----
      onMouseOver: (feature) => {
        // setHoveredProperties(feature.properties);
      },
      onMouseOut: () => {
        // setHoveredProperties({});
      },
      onStatus: (status) => {
        // console.log("statusxx", status);
      },
    },
  },
  infoFlaechen: {
    virtual: true,
    conf: {
      type: 'graphql',
      pane: 'additionalLayers2',
      referenceSystemDefinition: MappingConstants.proj4crs3857def,
      query: `
      query geoFields($bbPoly: geometry) {
        kassenzeichen(where: {kassenzeichen_geometrienArray: {kassenzeichen_geometrieObject: {geom: {geo_field: {_st_intersects: $bbPoly}}}}}) {
          kassenzeichennummer8
          kassenzeichen_geometrienArray {
            kassenzeichen_geometrieObject {
              geom {
                geo_field
              }
              name
            }
          }
        }
      }`,
      endpoint: REST_SERVICE_WUNDA + '/graphql/VERDIS_GRUNDIS/execute',
      fetchAllowed: (bbPoly) => {
        const area = getArea25832(bbPoly);
        const maxAreaForSearch = 150000;

        return area < maxAreaForSearch && area !== 0;
      },
      style: {
        pane: 'additionalLayers2', //you can set a pane here
        color: '#66666666',
        fillColor: '#28282866',
        weight: 0.5,
      },
      hoveredStyle: {
        color: '#66666666',
        fillColor: '#66666666',
        weight: 1,
      },
      omniAwareFeatureClickHandler,
      useHover: true,
      createFeature: createKassenzeichenInfoFlaechenFeatureArray,
      // ---- Events ----
      onMouseOver: (feature) => {
        // setHoveredProperties(feature.properties);
      },
      onMouseOut: () => {
        // setHoveredProperties({});
      },
      onStatus: (status) => {
        // console.log("statusxx", status);
      },
    },
  },
  strassenReinigung: {
    virtual: true,
    conf: {
      type: 'graphql',
      pane: 'additionalLayers2',
      referenceSystemDefinition: MappingConstants.proj4crs3857def,
      query: `
      query geoFields($bbPoly: geometry) {
        kassenzeichen(where: {frontenArray: {frontObject: {frontinfoObject: {geom: {geo_field: {_st_intersects: $bbPoly}}}}}}) {
          kassenzeichennummer8
          frontenArray {
            frontObject {
              nummer
              frontinfoObject {
                geom {
                  geo_field
                }
              }
            }
          }
        }
      }`,
      endpoint: REST_SERVICE_WUNDA + '/graphql/VERDIS_GRUNDIS/execute',
      fetchAllowed: (bbPoly) => {
        const area = getArea25832(bbPoly);
        const maxAreaForSearch = 130000;

        return area < maxAreaForSearch && area !== 0;
      },
      style: {
        pane: 'additionalLayers2', //you can set a pane here
        color: '#66666666',
        weight: 15,
      },
      hoveredStyle: {
        color: '#66666688',

        weight: 15,
      },

      omniAwareFeatureClickHandler,

      useHover: true,
      createFeature: createKassenzeichenFrontenFeatureArray,
      // ---- Events ----
      onMouseOver: (feature) => {
        // setHoveredProperties(feature.properties);
      },
      onMouseOut: () => {
        // setHoveredProperties({});
      },
      onStatus: (status) => {
        // console.log("statusxx", status);
      },
    },
  },
  verdisLayer: {
    initialActive: true,
    title: 'VerdIS Geometrien',
    dependentConf: {
      default: 'versiegelteFlaechen',
      overview: 'versiegelteFlaechen',
      sealedSurfaces: 'versiegelteFlaechen',
      'sealedSurfaces.details': 'versiegelteFlaechen',
      streetCleaning: 'strassenReinigung',
      'streetCleaning.details': 'strassenReinigung',
      info: 'infoFlaechen',
      seepagePermits: 'versiegelteFlaechen',
      'seepagePermits.details': 'versiegelteFlaechen',
    },
  },
};

export default function AdditionalLayers({
  shownIn = 'default',
  activeLayers = [],
  opacities = {},
  mapRef,
  jwt,
  onHoverUpdate,
  onGraphqlLayerStatus = (status) => {},
}) {
  const dispatch = useDispatch();
  const [urlParams, setUrlParams] = useSearchParams();

  return (
    <>
      {activeLayers.map((layerKey, index) => {
        const layerConf = configuration[layerKey];

        if (layerConf) {
          let conf = layerConf.conf;
          if (layerConf.dependentConf !== undefined) {
            const translate = layerConf.dependentConf[shownIn];
            conf = configuration[translate].conf;
          }
          let moreProps = {};

          if (conf.type === 'graphql') {
            moreProps.jwt = jwt;
            moreProps.mapRef = mapRef;
            moreProps.onMouseOut = () => {
              onHoverUpdate({});
            };
            moreProps.onMouseOver = (feature) => {
              onHoverUpdate(feature.properties);
            };
            moreProps.onStatus = onGraphqlLayerStatus;
          }

          if (conf.omniAwareFeatureClickHandler) {
            const handler = conf.omniAwareFeatureClickHandler({
              dispatch,
              urlParams,
              setUrlParams,
            });
            moreProps.featureClickHandler = handler;
          }

          return (
            <CismapLayer
              key={'Cismapayer.' + index}
              //   if a key is set in the config it will overwrite the simple key above
              {...{
                ...conf,
                opacity: opacities[layerKey] || 1,
                ...moreProps,
              }}
            ></CismapLayer>
          );
        }
      })}
    </>
  );
}
