import { MappingConstants } from "react-cismap";
import CismapLayer from "react-cismap/CismapLayer";
import { REST_SERVICE_WUNDA } from "../../constants/lagis";
import { concat, flatten } from "lodash";
import { reproject } from "reproject";
import { projectionData } from "react-cismap/constants/gis";
import proj4 from "proj4";
import getArea from "@turf/area";
import { drawerTextsHelper } from "@carma-collab/wuppertal/lagis-desktop";

const getWGS84GeoJSON = (geoJSON) => {
  try {
    const reprojectedGeoJSON = reproject(
      geoJSON,
      projectionData["25832"].def,
      proj4.WGS84,
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
const createFeatureArray = (data) => {
  const result = [];

  data.alkis_landparcel.forEach((landparcel) => {
    const feature = {
      type: "Feature",
      featureType: "flaeche",
      id: landparcel.id,
      hovered: false,
      weight: 0.5,
      geometry: {
        type: "Polygon",
        coordinates: [],
      },
      properties: {
        gemarkung: landparcel.gemarkung,
        flur: landparcel.flur,
        fstck_zaehler: landparcel.fstck_zaehler,
        fstck_nenner: landparcel.fstck_nenner,
      },
      crs: {
        type: "name",
        properties: {
          name: "urn:ogc:def:crs:EPSG::25832",
        },
      },
    };

    let coordinates = [];

    coordinates = concat(
      coordinates,
      flatten(landparcel.geom.geo_field.coordinates),
    );
    feature.geometry.coordinates = coordinates;
    result.push(feature);
  });

  return result;
};

export const configuration = {
  abt9: {
    initialActive: false,
    title: drawerTextsHelper.abtOpt,
    conf: {
      type: "wmts",
      url: "http://s10221.wuppertal-intra.de:8099/abt9_flst/services",
      layers: "abt9",
      version: "1.1.1",
      tileSize: 256,
      transparent: true,
      format: "image/png",
      pane: "additionalLayers1",
    },
  },
  baulastnachweis: {
    initialActive: false,
    title: drawerTextsHelper.baulastnachweisOpt,
    conf: {
      type: "wmts",
      url: "http://s10221.wuppertal-intra.de:8056/baulasten/services",
      layers: "baul",
      version: "1.1.1",
      tileSize: 256,
      transparent: true,
      format: "image/png",
      pane: "additionalLayers1",
    },
  },
  stadtFstck: {
    initialActive: false,
    title: drawerTextsHelper.stadtFstckOpt,
    conf: {
      type: "wmts",
      url: "http://s10221.wuppertal-intra.de:7098/stadt-flurstuecke/services",
      layers: "stadt_flurst",
      version: "1.1.1",
      tileSize: 256,
      transparent: true,
      format: "image/png",
      pane: "additionalLayers1",
    },
  },
  alkisLandparcels: {
    initialActive: false,
    title: drawerTextsHelper.alkisLandparcels,
    conf: {
      type: "graphql",
      referenceSystemDefinition: MappingConstants.proj4crs3857def,
      query: `
      query MyQuery($bbPoly: geometry) {
        alkis_landparcel(where: {geom: {geo_field: {_st_intersects: $bbPoly}}}) {
          gemarkung
          flur
          fstck_nenner
          fstck_zaehler
          id
          geom {
            geo_field
          }
        }
      }`,
      endpoint: REST_SERVICE_WUNDA + "/graphql/WUNDA_BLAU/execute",
      fetchAllowed: (bbPoly) => {
        const area = getArea25832(bbPoly);
        const maxAreaForSearch = 130000;

        return area < maxAreaForSearch && area !== 0;
      },
      style: {
        color: "#00000040",
        fillColor: "#00000020",
        weight: 2,
      },
      hoveredStyle: {
        color: "#00000040",
        fillColor: "#00000020",
        weight: 4,
      },
      useHover: true,
      createFeature: createFeatureArray,
      // ---- Events ----
      onMouseOver: (feature) => {
        setHoveredProperties(feature.properties);
      },
      onMouseOut: () => {
        setHoveredProperties({});
      },
      onStatus: (status) => {
        console.log("statusxx", status);
      },
    },
  },
};

export default function AdditionalLayers({
  activeLayers = [],
  opacities = {},
  mapRef,
  jwt,
  onHoverUpdate,
  onGraphqlLayerStatus = (status) => {},
}) {
  return (
    <>
      {activeLayers.map((layerKey, index) => {
        const layerConf = configuration[layerKey];

        if (layerConf) {
          let moreProps = {};
          if (layerConf.conf.type === "graphql") {
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

          return (
            <CismapLayer
              key={"Cismapayer." + index}
              //   if a key is set in the config it will overwrite the simple key above
              {...{
                ...layerConf.conf,
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
