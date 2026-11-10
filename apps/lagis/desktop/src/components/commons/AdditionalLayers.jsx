import { drawerTextsHelper } from "@carma-collab/wuppertal/lagis-desktop";
import {
  cismapConfToLibreLayer,
  sortLibreLayers,
} from "../../core/tools/libreLayers";

export const configuration = {
  abt9: {
    initialActive: false,
    title: drawerTextsHelper.abtOpt,
    conf: {
      type: "wmts",
      url: "https://sl0548-wuppertal-intra.map-hosting.de/forwardingTo/s10221/8099/abt9_flst/services",
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
      url: "https://sl0548-wuppertal-intra.map-hosting.de/forwardingTo/s10221/8056/baulasten/services",
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
      url: "https://sl0548-wuppertal-intra.map-hosting.de/forwardingTo/s10221/7098/stadt-flurstuecke/services",
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
    // Always shown with a low opacity and hidden from the optional layers in
    // the settings. The toggle/opacity code stays in place: remove
    // alwaysActive (and alwaysActiveOpacity) to make it optional again.
    alwaysActive: true,
    alwaysActiveOpacity: 0.3,
    title: drawerTextsHelper.alkisLandparcels,
    conf: {
      type: "vector",
      style: "https://tiles.cismet.de/alkis/flurstuecke.only.grey.style.json",
      //   offlineAvailable: true,
      //   offlineDataStoreKey: "wuppBasemap",
      pane: "additionalLayers2",
    },
  },
};

/** Active additional layers, in the order their Leaflet panes implied. */
export const getAdditionalLibreLayers = (activeLayers = [], opacities = {}) => {
  // alwaysActive layers ignore the persisted user selection and opacity, so a
  // stale "off" or opacity from earlier versions has no effect.
  const alwaysActiveKeys = Object.keys(configuration).filter(
    (key) => configuration[key].alwaysActive
  );
  const layerKeys = [
    ...activeLayers.filter((key) => !configuration[key]?.alwaysActive),
    ...alwaysActiveKeys,
  ];
  return sortLibreLayers(
    layerKeys.map((layerKey) => {
      const layerConf = configuration[layerKey];
      if (!layerConf) {
        return undefined;
      }
      return cismapConfToLibreLayer(
        layerKey,
        layerConf.conf,
        layerConf.alwaysActive
          ? layerConf.alwaysActiveOpacity ?? 1
          : opacities[layerKey] ?? 1,
        // additional layers sat above the background by default
        250
      );
    })
  );
};
