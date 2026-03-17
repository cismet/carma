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
    title: "basemap.de Farbe",
    mode: "default",
    layerKey: "basemap_color",
  },
  {
    title: "basemap.de Grau",
    mode: "default",
    layerKey: "basemap_grey",
  },
  {
    title: "basemap.de Relief",
    mode: "default",
    layerKey: "basemap_relief",
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
  basemap_color: {
    layerkey: "basemap_color",
    title: "basemap.de Farbe",
  },
  basemap_grey: {
    layerkey: "basemap_grey",
    title: "basemap.de Grau",
  },
  basemap_relief: {
    layerkey: "basemap_relief",
    title: "basemap.de Relief",
  },
};
