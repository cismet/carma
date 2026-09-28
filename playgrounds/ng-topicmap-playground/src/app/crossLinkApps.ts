export interface CrossLinkApp {
  on: string[];
  name: string;
  bsStyle: string;
  backgroundColor: string | null;
  link: string;
  target: string;
}

export const crossLinkApps: CrossLinkApp[] = [
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
    backgroundColor: "#326C88",
    link: "https://digital-twin-wuppertal-live.github.io/ebikes/",
    target: "_ebikes",
  },
];
