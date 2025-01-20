export const APP_BASE_PATH = import.meta.env.BASE_URL;

export const APP_KEY = "floodingmap";
export const STORAGE_PREFIX = "hgk";

export const HGK_KEYS = Object.freeze({
  0: { hws: "HQ10-50", noHws: "HQ10-50_noHWS" },
  1: { hws: "HQ100", noHws: "HQ100_noHWS" },
  2: { noHws: "HQ500" },
});

export const HGK_TERRAIN_PROVIDER_URLS = {
  "HQ10-50": "https://cesium-wupp-terrain.cismet.de/HQ10-50/",
  HQ100: "https://cesium-wupp-terrain.cismet.de/HQ100/",
  HQ500: "https://cesium-wupp-terrain.cismet.de/HQ500cm/",
  "HQ10-50_noHWS": "https://cesium-wupp-terrain.cismet.de/HQ10-50_noHWS/",
  HQ100_noHWS: "https://cesium-wupp-terrain.cismet.de/HQ100_noHWS/",
};

export const SYNC_TOKEN = "floodingAndRainhazardSyncWupp";

export const EMAIL = "hochwasser@stadt.wuppertal.de";

export const HOME_ZOOM = 18;

export const AERIAL_BACKGROUND_INDEX = 2;
