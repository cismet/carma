// Copy of the geoportal `config`'s `convertLayerStringToLayers` plus the
// `namedLayers` map it resolves against. Reproduced locally so the Leaflet
// print helper (`getPrintLayers`) stays self-contained instead of importing
// the app's large layer/topic configuration.

const namedLayers: any = {
  "wupp-plan-live": {
    type: "wms",
    url: "https://geodaten.metropoleruhr.de/spw2/service",
    layers: "spw2_light",
    tiled: false,
    version: "1.3.0",
  },
  trueOrtho2020: {
    type: "wms",
    url: "https://maps.wuppertal.de/karten",
    layers: "R102:trueortho2020",
    transparent: true,
  },
  rvrGrundriss: {
    type: "wmts",
    url: "https://geodaten.metropoleruhr.de/spw2/service",
    layers: "spw2_light_grundriss",
    version: "1.3.0",
    transparent: true,
    tiled: false,
  },
  trueOrtho2022: {
    type: "wms",
    url: "https://maps.wuppertal.de/karten",
    layers: "R102:trueortho2022",
    transparent: true,
  },
  trueOrtho2024: {
    type: "wms",
    url: "https://maps.wuppertal.de/karten",
    layers: "R102:trueortho2024",
    transparent: true,
  },
  trueOrtho2024Alternative: {
    type: "wms",
    url: "https://geo.udsp.wuppertal.de/geoserver-cloud/ows",
    layers: "GIS-102:trueortho2024",
    maxNativeZoom: 22,
    transparent: true,
  },
  trueOrtho2021: {
    type: "wms",
    url: "https://www.wms.nrw.de/geobasis/wms_nw_hist_dop",
    layers: "nw_hist_dop_2021",
    transparent: true,
  },
  rvrSchriftNT: {
    type: "wmts-nt",
    url: "https://geodaten.metropoleruhr.de/dop/dop_overlay?language=ger",
    layers: "dop_overlay",
    version: "1.3.0",
    tiled: false,
    transparent: true,
    buffer: 50,
  },
  rvrSchrift: {
    type: "wmts",
    url: "https://geodaten.metropoleruhr.de/dop/dop_overlay?language=ger",
    layers: "dop_overlay",
    version: "1.3.0",
    tiled: false,
    transparent: true,
  },
  amtlich: {
    type: "tiles",
    maxNativeZoom: 20,
    maxZoom: 22,
    url: "https://geodaten.metropoleruhr.de/spw2?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=spw2_light&STYLE=default&FORMAT=image/png&TILEMATRIXSET=webmercator_hq&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}",
  },
  basemap_relief: {
    type: "vector",
    style:
      "https://sgx.geodatenzentrum.de/gdz_basemapde_vektor/styles/bm_web_top.json",
  },
  amtlichBasiskarte: {
    type: "wmts",
    url: "https://geo.udsp.wuppertal.de/geoserver-cloud/ows",
    layers: "GIS-102:abkf",
    maxNativeZoom: 20,
    transparent: true,
  },
};

export const convertLayerStringToLayers = (
  layerString: string,
  visible: boolean,
  mainOpacity?: number
): any => {
  const layers = layerString.split("|");
  return layers.map((layer) => {
    const [layerConfigName, opacity] = layer.split("@");
    const config = namedLayers[layerConfigName];
    return {
      ...config,
      visible,
      layerType: config.type,
      opacity: ((Number(opacity) || 1) / 100) * mainOpacity || 1,
    };
  });
};
