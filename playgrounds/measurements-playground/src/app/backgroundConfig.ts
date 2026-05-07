export const backgroundModes = [
  {
    title: "Stadtplan (Tag)",
    mode: "default",
    layerKey: "stadtplan",
  },
  {
    title: "Stadtplan (Nacht)",
    mode: "night",
    layerKey: "stadtplan",
  },
  {
    title: "Luftbildkarte",
    mode: "default",
    layerKey: "lbk",
  },
  {
    title: "cismet - basemap.de Farbe",
    mode: "default",
    layerKey: "our_basemap_color",
  },
  {
    title: "cismet - basemap.de Grau",
    mode: "default",
    layerKey: "our_basemap_grey",
  },
  {
    title: "cismet - basemap.de Relief",
    mode: "default",
    layerKey: "our_basemap_relief",
  },
];

export const backgroundConfigurations = {
  stadtplan: {
    layerkey: "wupp-plan-live@90",
    src: "/images/rain-hazard-map-bg/citymap.png",
    title: "Stadtplan",
  },
  lbk: {
    layerkey: "rvrGrundriss@100|trueOrtho2024@75|rvrSchriftNT@100",
    src: "/images/rain-hazard-map-bg/ortho.png",
    title: "Luftbildkarte",
  },
  our_basemap_color: {
    layerkey: "our_basemap_color",
    title: "our basemap.de Farbe",
  },
  our_basemap_grey: {
    layerkey: "our_basemap_grey",
    title: "our basemap.de Grau",
  },
  our_basemap_relief: {
    layerkey: "our_basemap_relief",
    title: "our basemap.de Relief",
  },
};
