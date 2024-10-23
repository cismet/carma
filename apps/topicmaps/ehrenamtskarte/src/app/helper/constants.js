export const host = 'https://wupp-topicmaps-data.cismet.de';
//joined lebenslagen need to be sorted
export let POI_COLORS = {
  'Freizeit, Sport': '#194761',
  Mobilität: '#6BB6D7',
  'Erholung, Religion': '#094409',
  Gesellschaft: '#B0CBEC',
  Religion: '#0D0D0D',
  Gesundheit: '#CB0D0D',
  'Erholung, Freizeit': '#638555',
  Sport: '#0141CF',
  'Freizeit, Kultur': '#B27A08',
  'Gesellschaft, Kultur': '#E26B0A',
  'öffentliche Dienstleistungen': '#417DD4',
  Orientierung: '#BFBFBF',
  Bildung: '#FFC000',
  Stadtbild: '#695656',
  'Gesellschaft, öffentliche Dienstleistungen': '#569AD6',
  'Dienstleistungen, Freizeit': '#26978F',
  Dienstleistungen: '#538DD5',
  'Bildung, Freizeit': '#BBAA1E',
  Kinderbetreuung: '#00A0B0',
};

export const crossLinkApps = [
  {
    on: ['Kinderbetreuung'],
    name: 'Kita-Finder',
    bsStyle: 'success',
    backgroundColor: null,
    link: 'https://wunda-geoportal.cismet.de/#/kitas',
    target: '_kitas',
  },
  {
    on: ['Sport', 'Freizeit'],
    name: 'Bäderkarte',
    bsStyle: 'primary',
    backgroundColor: null,
    link: 'https://wunda-geoportal.cismet.de/#/baeder',
    target: '_baeder',
  },
  {
    on: ['Kultur'],
    name: 'Kulturstadtplan',
    bsStyle: 'warning',
    backgroundColor: null,
    link: 'https://wunda-geoportal.cismet.de/#/kulturstadtplan',
    target: '_kulturstadtplan',
  },
  {
    on: ['Mobilität'],
    name: 'Park+Ride-Karte',
    bsStyle: 'warning',
    backgroundColor: '#62B7D5',
    link: 'https://wunda-geoportal.cismet.de/#/xandride',
    target: '_xandride',
  },

  {
    on: ['Mobilität'],
    name: 'E-Auto-Ladestationskarte',
    bsStyle: 'warning',
    backgroundColor: '#003E7A',
    link: 'https://wunda-geoportal.cismet.de/#/elektromobilitaet',
    target: '_elektromobilitaet',
  },
  {
    on: ['Mobilität'],
    name: 'E-Fahrrad-Karte',
    bsStyle: 'warning',
    backgroundColor: '#326C88', //'#15A44C', //'#EC7529',
    link: 'https://wunda-geoportal.cismet.de/#/ebikes',
    target: '_ebikes',
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

export const constants = {
  TRAEGERTYP_ANDERE: 'KITAS/CONSTS/TRAEGERTYP_ANDERE',
  TRAEGERTYP_BETRIEBSKITA: 'KITAS/CONSTS/TRAEGERTYP_BETRIEBSKITA',
  TRAEGERTYP_STAEDTISCH: 'KITAS/CONSTS/TRAEGERTYP_STAEDTISCH',
  TRAEGERTYP_ELTERNINITIATIVE: 'KITAS/CONSTS/TRAEGERTYP_ELTERNINITIATIVE',
  TRAEGERTYP_EVANGELISCH: 'KITAS/CONSTS/TRAEGERTYP_EVANGELISCH',
  TRAEGERTYP_KATHOLISCH: 'KITAS/CONSTS/TRAEGERTYP_KATHOLISCH',
  ALTER_UNTER2: 'KITAS/CONSTS/ALTER_UNTER2',
  ALTER_AB2: 'KITAS/CONSTS/ALTER_AB2',
  ALTER_AB3: 'KITAS/CONSTS/ALTER_AB3',
  STUNDEN_NUR_35: 'KITAS/CONSTS/STUNDEN_NUR_35',
  STUNDEN_NUR_35_u_45: 'KITAS/CONSTS/STUNDEN_NUR_35_u_45',
  STUNDEN_NUR_45: 'KITAS/CONSTS/STUNDEN_NUR_45',
  PROFIL_INKLUSION: 'KITAS/CONSTS/PROFIL_INKLUSION',
  PROFIL_NORMAL: 'KITAS/CONSTS/PROFIL_NORMAL',
  STUNDEN_FILTER_35: 'KITAS/CONSTS/STUNDEN_FILTER_35',
  STUNDEN_FILTER_45: 'KITAS/CONSTS/STUNDEN_FILTER_45',
  FEATURE_RENDERING_BY_PROFIL: 'KITAS/CONSTS/FEATURE_RENDERING_BY_PROFIL',
  FEATURE_RENDERING_BY_TRAEGERTYP:
    'KITAS/CONSTS/FEATURE_RENDERING_BY_TRAEGERTYP',
  TRAEGERTEXT: {},
  TRAEGERTEXT_FOR_DESCRIPTION: {},
};

constants.TRAEGERTYP = [
  constants.TRAEGERTYP_ANDERE,
  constants.TRAEGERTYP_BETRIEBSKITA,
  constants.TRAEGERTYP_STAEDTISCH,
  constants.TRAEGERTYP_ELTERNINITIATIVE,
  constants.TRAEGERTYP_EVANGELISCH,
  constants.TRAEGERTYP_KATHOLISCH,
];
constants.ALTER = [
  constants.ALTER_UNTER2,
  constants.ALTER_AB2,
  constants.ALTER_AB3,
];
constants.STUNDEN = [
  constants.STUNDEN_NUR_35,
  constants.STUNDEN_NUR_35_u_45,
  constants.STUNDEN_NUR_45,
];

constants.TRAEGERTEXT[0] = 'freier Trägerschaft';
constants.TRAEGERTEXT[1] = 'Betriebskindertageseinrichtung';
constants.TRAEGERTEXT[2] = 'städtischer Trägerschaft';
constants.TRAEGERTEXT[3] = 'Trägerschaft einer Elterninitiative';
constants.TRAEGERTEXT[4] = 'kirchlicher Trägerschaft (evangelisch)';
constants.TRAEGERTEXT[5] = 'kirchlicher Trägerschaft (katholisch)';

constants.TRAEGERTEXT_FOR_DESCRIPTION[constants.TRAEGERTYP_ANDERE] =
  'andere Einrichtungen in freier Trägerschaft';
constants.TRAEGERTEXT_FOR_DESCRIPTION[constants.TRAEGERTYP_BETRIEBSKITA] =
  'Betriebskitas';
constants.TRAEGERTEXT_FOR_DESCRIPTION[constants.TRAEGERTYP_STAEDTISCH] =
  'städtische Einrichtungen';
constants.TRAEGERTEXT_FOR_DESCRIPTION[constants.TRAEGERTYP_ELTERNINITIATIVE] =
  'Elterninitiativen';
constants.TRAEGERTEXT_FOR_DESCRIPTION[constants.TRAEGERTYP_EVANGELISCH] =
  'evangelische Einrichtungen';
constants.TRAEGERTEXT_FOR_DESCRIPTION[constants.TRAEGERTYP_KATHOLISCH] =
  'katholische Einrichtungen';
