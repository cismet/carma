import { getGeoJsonSourceId } from "@carma-mapping/engines/maplibre";

export const crossLinkApps = [
  {
    on: ["Kinderbetreuung"],
    name: "Kita-Finder",
    bsStyle: "success",
    backgroundColor: null,
    link: "https://digital-twin-wuppertal-live.github.io/kita-finder/",
    target: "_kitas",
  },
  {
    on: ["Sport", "Freizeit"],
    name: "Bäderkarte",
    bsStyle: "primary",
    backgroundColor: null,
    link: "https://digital-twin-wuppertal-live.github.io/baederkarte/",
    target: "_baeder",
  },
  {
    on: ["Kultur"],
    name: "Kulturstadtplan",
    bsStyle: "warning",
    backgroundColor: null,
    link: "https://digital-twin-wuppertal-live.github.io/kulturstadtplan/",
    target: "_kulturstadtplan",
  },
  {
    on: ["Mobilität"],
    name: "Park+Ride-Karte",
    bsStyle: "warning",
    backgroundColor: "#62B7D5",
    link: "https://digital-twin-wuppertal-live.github.io/xandride/",
    target: "_xandride",
  },

  {
    on: ["Mobilität"],
    name: "E-Auto-Ladestationskarte",
    bsStyle: "warning",
    backgroundColor: "#003E7A",
    link: "https://digital-twin-wuppertal-live.github.io/elektromobilitaet/",
    target: "_elektromobilitaet",
  },
  {
    on: ["Mobilität"],
    name: "E-Fahrrad-Karte",
    bsStyle: "warning",
    backgroundColor: "#326C88", //'#15A44C', //'#EC7529',
    link: "https://digital-twin-wuppertal-live.github.io/ebikes/",
    target: "_ebikes",
  },
  // {
  //   on: ['Gesundheit'],
  //   name: 'Corona-Präventionskarte',
  //   bsStyle: 'warning',
  //   backgroundColor: '#BD000E', //'#15A44C', //'#EC7529',
  //   link: 'https://topicmaps-wuppertal.github.io/corona-praevention/#/?title',
  //   target: '_corona',
  // },

  // {   on: ["Sport"],   name: "Sporthallen",   bsStyle: "default",
  // backgroundColor: null,   link: "/#/ehrenamt",   target: "_hallen" }
];

export const POI_LAYER_CONFIG = {
  type: "geojson" as const,
  name: "POIs",
  data: "https://tiles.cismet.de/poi/poi.json",
  infoboxMapping: [
    "foto: p.foto",
    "headerColor:p.schrift",
    "header:p.kombi",
    "title:p.geographicidentifier",
    "additionalInfo:p.adresse",
    "subtitle: p.info",
    "url:p.url",
    "tel:p.telefon",
    "email:p.email",
  ],
};

export const POI_SOURCE_ID = getGeoJsonSourceId(POI_LAYER_CONFIG.name);
