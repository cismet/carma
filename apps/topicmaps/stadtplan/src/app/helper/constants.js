export const host = "https://wupp-topicmaps-data.cismet.de";
//joined lebenslagen need to be sorted
export let POI_COLORS = {
  "Freizeit, Sport": "#194761",
  Mobilität: "#6BB6D7",
  "Erholung, Religion": "#094409",
  Gesellschaft: "#B0CBEC",
  Religion: "#0D0D0D",
  Gesundheit: "#CB0D0D",
  "Erholung, Freizeit": "#638555",
  Sport: "#0141CF",
  "Freizeit, Kultur": "#B27A08",
  "Gesellschaft, Kultur": "#E26B0A",
  "öffentliche Dienstleistungen": "#417DD4",
  Orientierung: "#BFBFBF",
  Bildung: "#FFC000",
  Stadtbild: "#695656",
  "Gesellschaft, öffentliche Dienstleistungen": "#569AD6",
  "Dienstleistungen, Freizeit": "#26978F",
  Dienstleistungen: "#538DD5",
  "Bildung, Freizeit": "#BBAA1E",
  Kinderbetreuung: "#00A0B0",
};

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
