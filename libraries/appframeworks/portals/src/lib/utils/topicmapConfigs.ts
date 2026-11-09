export const backgroundConfWithFastOrtho2024 = {
  lbk: {
    layerkey: "rvrGrundriss@100|fasttrueOrtho2024@75|rvrSchriftNT@100",
    src: "/images/rain-hazard-map-bg/ortho.png",
    title: "Luftbildkarte",
  },
  stadtplan: {
    layerkey: "wupp-plan-live@90",
    src: "/images/rain-hazard-map-bg/citymap.png",
    title: "Stadtplan",
  },
};

// OSM vector background for MapLibre topicmaps; spread into an app's
// backgroundConfigurations and pair with backgroundModesWithOsm
export const osmBackgroundConfiguration = {
  osm: {
    layerkey: "osm_shortbread@100",
    src: "/images/rain-hazard-map-bg/citymap.png",
    title: "OpenStreetMap",
  },
};

export const backgroundModesWithOsm = [
  { title: "Stadtplan (Tag)", mode: "default", layerKey: "stadtplan" },
  { title: "Stadtplan (Nacht)", mode: "night", layerKey: "stadtplan" },
  { title: "OpenStreetMap", mode: "default", layerKey: "osm" },
  { title: "Luftbildkarte", mode: "default", layerKey: "lbk" },
];

export const defaultBackgroundConfigurations = {
  topo: {
    layerkey: "hillshade|bplan_abkg@30|wupp-plan-live@20",
    src: "/images/rain-hazard-map-bg/topo.png",
    title: "Top. Karte",
  },
  lbk: {
    // layerkey: "rvrGrundriss@100|trueOrtho2022@75|rvrSchriftNT@100",
    layerkey: "rvrGrundriss@100|trueOrtho2024@75|rvrSchriftNT@100",
    src: "/images/rain-hazard-map-bg/ortho.png",
    title: "Luftbildkarte",
  },
  stadtplan: {
    layerkey: "wupp-plan-live@90",
    src: "/images/rain-hazard-map-bg/citymap.png",
    title: "Stadtplan",
  },
};
