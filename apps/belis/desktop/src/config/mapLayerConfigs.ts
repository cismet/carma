/**
 * MapLibre-compatible layer configurations for Belis.
 *
 * Background layers: one active at a time (radio buttons).
 * Additional layers: multiple can be active (checkboxes).
 * The Leuchten data layer is always on and stays hardcoded in BelisMapWrapper.
 */

import type {
  LibreLayer,
  FilterCategory,
} from "@carma-mapping/engines/maplibre";

export interface LayerEntry {
  title: string;
  layer: LibreLayer | LibreLayer[];
}

export const backgroundLayerConfigs: Record<string, LayerEntry> = {
  rvrLight: {
    title: "RVR (light)",
    layer: {
      type: "wmts",
      url: "https://geodaten.metropoleruhr.de/spw2/service",
      layers: "spw2_light",
      version: "1.3.0",
      transparent: true,
      format: "image/png",
      tileSize: 512,
      maxZoom: 26,
    },
  },
  liegenschaftskarteGrau: {
    title: "Liegenschaftskarte (grau)",
    layer: {
      type: "wmts",
      url: "https://s10222-wuppertal-intra.map-hosting.de/forwardingTo/s10221/7098/alkis/services",
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
    title: "Liegenschaftskarte (bunt)",
    layer: {
      type: "wmts",
      url: "https://s10222-wuppertal-intra.map-hosting.de/forwardingTo/s10221/7098/alkis/services",
      layers: "alkomf",
      styles: "default",
      version: "1.1.1",
      tileSize: 256,
      transparent: true,
      format: "image/png",
    },
  },
  trueOrtho: {
    title: "True Orthofoto",
    layer: {
      type: "wms",
      url: "https://geo.udsp.wuppertal.de/geoserver-cloud/ows",
      layers: "GIS-102:trueortho2024",
      tileSize: 256,
      transparent: true,
      maxZoom: 26,
      format: "image/png",
    },
  },
  lbk: {
    title: "Luftbildkarte",
    layer: [
      {
        type: "wmts",
        url: "https://geodaten.metropoleruhr.de/spw2/service",
        layers: "spw2_light_grundriss",
        version: "1.3.0",
        transparent: true,
        format: "image/png",
        maxZoom: 26,
      },
      {
        type: "wms",
        url: "https://geo.udsp.wuppertal.de/geoserver-cloud/ows",
        layers: "GIS-102:trueortho2024",
        tileSize: 256,
        transparent: true,
        maxZoom: 26,
        format: "image/png",
      },
      {
        type: "wmts",
        url: "https://geodaten.metropoleruhr.de/dop/dop_overlay?language=ger",
        layers: "dop_overlay",
        version: "1.3.0",
        format: "image/png",
        transparent: true,
        maxZoom: 26,
      },
    ],
  },
  stadtplanGrau: {
    title: "Stadtplan (grau)",
    layer: {
      type: "vector",
      name: "Stadtplan grau",
      style:
        "https://sgx.geodatenzentrum.de/gdz_basemapde_vektor/styles/bm_web_gry.json",
    },
  },
  stadtplanBunt: {
    title: "Stadtplan (bunt)",
    layer: {
      type: "vector",
      name: "Stadtplan bunt",
      style:
        "https://sgx.geodatenzentrum.de/gdz_basemapde_vektor/styles/bm_web_top.json",
    },
  },
};

export const additionalLayerConfigs: Record<string, LayerEntry> = {
  stadtFstck: {
    title: "Städtische Flurstücke",
    layer: {
      type: "wmts",
      url: "https://s10222-wuppertal-intra.map-hosting.de/forwardingTo/s10221/7098/stadt-flurstuecke/services",
      layers: "stadt_flurst",
      version: "1.1.1",
      tileSize: 256,
      transparent: true,
      format: "image/png",
    },
  },
  strassen: {
    title: "Straßen",
    layer: {
      type: "vector",
      name: "Straßen",
      style: "https://tiles.cismet.de/alkis/streets.style.json",
    },
  },
  // alkisBlack: {
  //   title: "Alkis Vektorlayer",
  //   layer: {
  //     type: "vector",
  //     name: "Alkis Vektorlayer",
  //     style: "https://tiles.cismet.de/alkis/flurstuecke.black.style.json",
  //   },
  // },
  // need to import bottstrap and cismap in main.tsx for this one to work, so leaving it out for now
};

/** Leuchten data layer, always visible */
export const BELIS_STYLE_URL = "https://tiles.cismet.de/belis/styleX.json";
export const BELIS_ORIGINAL_SOURCE = "belis-source";

export const leuchtenDataLayer: LibreLayer = {
  type: "vector",
  name: "Leuchten",
  style: BELIS_STYLE_URL,
  opacity: 1,
};

export const BELIS_SOURCE_LAYERS = [
  "leuchten",
  "mast",
  "mauerlaschen",
  "schaltstelle",
  "leitungen",
  "abzweigdosen",
] as const;

export const BELIS_FILTER_CATEGORIES: FilterCategory[] = [
  {
    key: "leuchten",
    label: "Leuchten",
    sourceLayers: ["leuchten"],
    layerPatterns: ["leuchten"],
  },
  {
    key: "masten",
    label: "Masten",
    sourceLayers: ["mast"],
    layerPatterns: ["mast"],
  },
  {
    key: "mauerlaschen",
    label: "Mauerlaschen",
    sourceLayers: ["mauerlaschen"],
    layerPatterns: ["mauerlaschen"],
  },
  {
    key: "leitungen",
    label: "Leitungen",
    sourceLayers: ["leitungen"],
    layerPatterns: ["leitungen"],
  },
  {
    key: "schaltstellen",
    label: "Schaltstellen",
    sourceLayers: ["schaltstelle"],
    layerPatterns: ["schaltstelle"],
  },
  {
    key: "abzweigdosen",
    label: "Abzweigdosen",
    sourceLayers: ["abzweigdosen"],
    layerPatterns: ["abzweigdose"],
  },
];
