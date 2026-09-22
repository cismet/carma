import { drawerTextsHelper } from "@carma-collab/wuppertal/lagis-desktop";
import { dynamicOrtho } from "./Settings";
import {
  cismapConfToLibreLayer,
  sortLibreLayers,
} from "../../core/tools/libreLayers";

export const configuration = {
  liegenschaftskarteGrau: {
    title: drawerTextsHelper.liegenschaftskarteGrauOpt,
    conf: {
      type: "wmts",
      url: "http://s10221.wuppertal-intra.de:7098/alkis/services",
      layers: "alkomgw",
      styles: "default",
      version: "1.1.1",
      tileSize: 256,
      maxZoom: 26,

      transparent: true,
      format: "image/png",
    },
  },
  liegenschaftskarteBunt: {
    title: drawerTextsHelper.liegenschaftskarteBuntOpt,
    conf: {
      type: "wmts",
      url: "http://s10221.wuppertal-intra.de:7098/alkis/services",
      layers: "alkomf",
      styles: "default",
      version: "1.1.1",
      tileSize: 256,
      transparent: true,
      format: "image/png",
    },
  },
  trueOrtho: {
    title: drawerTextsHelper.trueOrthoOpt,
    conf: (year = 2024) => {
      // Use the dynamicOrtho configuration for the selected year
      return dynamicOrtho[year] || dynamicOrtho[2024];
    },
  },
  lbk: {
    title: drawerTextsHelper.lbkOpt,
    conf: [
      {
        type: "wmts",
        url: "https://geodaten.metropoleruhr.de/spw2/service",
        layers: "spw2_light_grundriss",
        version: "1.3.0",
        pane: "backgroundvectorLayers",
        transparent: true,
        format: "image/png",
        maxZoom: 26,

        tiled: false,
      },
      {
        type: "wms",
        url: "https://geo.udsp.wuppertal.de/geoserver-cloud/ows",
        layers: "GIS-102:trueortho2024",
        // url: "https://maps.wuppertal.de/karten",
        // layers: "R102:trueortho2024",
        tileSize: 256,
        transparent: true,
        pane: "backgroundLayers",
        maxZoom: 26,
        opacityFunction: (opacity) => opacity * 0.75,
        format: "image/png",
      },
      {
        type: "wmts",
        url: "https://geodaten.metropoleruhr.de/dop/dop_overlay?language=ger",
        layers: "dop_overlay",
        version: "1.3.0",
        tiled: false,
        format: "image/png",
        transparent: true,
        maxZoom: 26,
        pane: "additionalLayers0",
      },
    ],
  },
  stadtplanGrau: {
    title: drawerTextsHelper.stadtplanGrauOpt,
    conf: {
      type: "vector",
      style: "https://omt.map-hosting.de/styles/cismet-light/style.json",
      //   offlineAvailable: true,
      //   offlineDataStoreKey: "wuppBasemap",
      pane: "backgroundvectorLayers",
    },
  },
  stadtplan: {
    title: drawerTextsHelper.stadtplanOpt,
    conf: {
      type: "vector",
      style: "https://omt.map-hosting.de/styles/osm-bright-grey/style.json",
      //   offlineAvailable: true,
      //   offlineDataStoreKey: "wuppBasemap",
      pane: "backgroundvectorLayers",
    },
  },
  lsg: {
    title: "Luftbild und Stadtgrundkarte",
    conf: [
      {
        type: "wmts",
        url: "https://geo.udsp.wuppertal.de/geoserver-cloud/ows",
        layers: "GIS-102:trueortho2024",
        // url: "https://maps.wuppertal.de/karten",
        // layers: "R102:trueortho2024",
        tileSize: 256,
        transparent: true,
        pane: "backgroundLayers",
        maxZoom: 26,
        opacityFunction: (opacity) => opacity,
        format: "image/png",
      },
      {
        type: "wmts",
        url: "http://s10221.wuppertal-intra.de:7098/alkis/services",
        layers: "alkomgw",
        styles: "default",
        version: "1.1.1",
        tileSize: 256,
        maxZoom: 26,
        opacityFunction: (opacity) => opacity * 0.7,
        transparent: true,
        format: "image/png",
      },
    ],
  },
};

/**
 * LibreLayers for the selected background. A config is a single conf, an array
 * of confs, or a function of the true ortho year; each conf may narrow the
 * shared opacity through its own opacityFunction.
 */
export const getBackgroundLibreLayers = (
  activeBackgroundLayer,
  opacities = {},
  selectedYear = 2024
) => {
  const currentConf = configuration[activeBackgroundLayer];
  if (!currentConf) {
    return [];
  }

  let actualConf = currentConf.conf;
  if (typeof actualConf === "function") {
    actualConf = actualConf(selectedYear);
  }

  const baseOpacity = opacities[activeBackgroundLayer] ?? 1;
  const confs = Array.isArray(actualConf) ? actualConf : [actualConf];

  return sortLibreLayers(
    confs.map((conf, index) => {
      const opacity = conf.opacityFunction
        ? conf.opacityFunction(baseOpacity)
        : baseOpacity;
      return cismapConfToLibreLayer(
        `${activeBackgroundLayer}.${index}`,
        conf,
        opacity,
        // a conf without a pane defaulted to backgroundLayers
        100
      );
    })
  );
};
