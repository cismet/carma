import type { Config, LayerConfig, LayerProps } from './types';

export const config = {
  Ortho: {
    title: 'Orthofotos',
    layers: [
      {
        name: 'R102:luftbild2022',
      },
      {
        name: 'R102:luftbild2020',
      },
      {
        name: 'R102:luftbild2018',
      },
      {
        name: 'R102:luftbild2016',
      },
      {
        name: 'R102:luftbild2014',
      },
      {
        name: 'R102:luftbild2012',
      },
      {
        name: 'R102:luftbild2010',
      },
      {
        name: 'R102:luftbild2007',
      },
      {
        name: 'R102:luftbild2005',
      },
      {
        name: 'R102:luftbild2002',
      },
      {
        name: 'R102:luftbild1997',
      },
      {
        name: 'R102:luftbild1991',
      },
      {
        name: 'R102:luftbild1985',
      },
      {
        name: 'R102:luftbild1979',
      },
      {
        name: 'R102:luftbild1928',
      },
      {
        name: 'R102:trueortho2022',
      },
      {
        name: 'R102:trueortho2020',
      },
      {
        name: 'R102:trueortho2018',
      },
    ],
  },
  Starkregen: {
    layers: [
      {
        name: 'R102:50md',
      },
      {
        name: 'R102:50d',
      },
      {
        name: 'R102:50v',
      },
      {
        name: 'R102:100md',
      },
      {
        name: 'R102:100d',
      },
      {
        name: 'R102:100v',
      },
      {
        name: 'R102:90md',
      },
      {
        name: 'R102:90d',
      },
      {
        name: 'R102:90v',
      },
      {
        name: 'R102:SRmd',
      },
      {
        name: 'R102:SRd',
      },
      {
        name: 'R102:SRv',
      },
    ],
  },
  Lärmkarten: {
    layers: [
      {
        name: 'laerm2016:STR_RAST_DEN',
        Title: '2016 Straßenverkehrslärm (LDEN)',
        pictureBoundingBox: [
          784621.3180330665, 6660622.321170634, 794304.9340539448,
          6666636.959833823,
        ],
      },
      {
        name: 'laerm2016:STR_RAST_NGT',
        Title: '2016 Straßenverkehrslärm (LNIGHT)',
        pictureBoundingBox: [
          784621.3180330665, 6660622.321170634, 794304.9340539448,
          6666636.959833823,
        ],
      },
      {
        name: 'laerm2016:SCS_RAST_NGT',
        Title: '2016 Schienenverkehrslärm (LNIGHT)',
        pictureBoundingBox: [
          793306.4753719696, 6664907.572068873, 802990.091392848,
          6670922.2107320605,
        ],
      },
      {
        name: 'laerm2016:IND_RAST_NGT',
        Title: '2016 Gewerbelärm (LNIGHT)',
        pictureBoundingBox: [
          788913.734902706, 6663818.344415807, 793755.542913145,
          6666825.663747405,
        ],
      },
      {
        name: 'laerm2022:STR_RAST_DEN',
        Title: '2022 Straßenverkehrslärm (LDEN)',
        pictureBoundingBox: [
          784621.3180330665, 6660622.321170634, 794304.9340539448,
          6666636.959833823,
        ],
      },
      {
        name: 'laerm2022:STR_RAST_NGT',
        Title: '2022 Straßenverkehrslärm (LNIGHT)',
        pictureBoundingBox: [
          784621.3180330665, 6660622.321170634, 794304.9340539448,
          6666636.959833823,
        ],
      },
      {
        name: 'laerm2022:SCS_RAST_DEN',
        Title: '2022 Schienenverkehrslärm (LNIGHT)',
        pictureBoundingBox: [
          793306.4753719696, 6664907.572068873, 802990.091392848,
          6670922.2107320605,
        ],
      },
    ],
  },
  Schulen: {
    layers: [
      {
        name: 'poi_schulen_grund',
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
      },
      {
        name: 'poi_schulen_gym',
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
      },
      {
        name: 'poi_schulen_real',
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
      },
      {
        name: 'poi_schulen_haupt',
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
      },
      {
        name: 'poi_schulen_gesamt',
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
      },
      {
        name: 'poi_schulen_forder',
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
      },
      {
        name: 'poi_schulen_andere',
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
      },
      {
        name: 'poi_schulen_beruf',
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
      },
    ],
  },
};

export const serviceConfig: Record<string, LayerConfig> = {
  wuppKarten: {
    url: 'https://maps.wuppertal.de/karten',
    name: 'karten',
  },
  wuppUmwelt: {
    url: 'https://maps.wuppertal.de/umwelt',
    name: 'umwelt',
  },
  wuppInfra: {
    url: 'https://maps.wuppertal.de/infra',
    name: 'infra',
  },
  wuppPOI: {
    url: 'https://maps.wuppertal.de/poi',
    name: 'poi',
  },
  wuppPlanung: {
    url: 'https://maps.wuppertal.de/planung',
    name: 'planung',
  },
  wuppInspire: {
    url: 'https://maps.wuppertal.de/inspire',
    name: 'inspire',
  },
  wuppImmo: {
    url: 'https://maps.wuppertal.de/immo',
    name: 'immo',
  },
  wuppVerkehr: {
    url: 'https://maps.wuppertal.de/verkehr',
    name: 'verkehr',
  },
  wuppGebiet: {
    url: 'https://maps.wuppertal.de/gebiet',
    name: 'gebiet',
  },
  wuppTopicMaps: {
    type: 'topicmaps',
    name: 'topicmaps',
  },
  wuppVector: {
    name: 'wuppVector',
  },
};

export const vectorConfig: Config = {
  Title: 'Vector Karten',
  serviceName: 'wuppVector',
  layers: [
    {
      id: 'vecKanal',
      name: 'vecKanal',
      title: 'Kanäle',
      description: 'Vektor Layer der Kanäle',
      tags: ['Vector Karten', 'Kanäle'],
      keywords: [':vec:'],
      type: 'layer',
      layerType: 'vector',
      thumbnail:
        'https://images.unsplash.com/photo-1618901882511-e7adb73a1ee0?q=80&w=2664&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
      props: {
        style: 'https://omt.map-hosting.de/styles/kanal/style.json',
      },
    },
    {
      id: 'vecBaeume',
      name: 'vecBaeume',
      title: 'Bäume',
      description: 'Vektor Layer der Bäume',
      tags: ['Vector Karten', 'Bäume'],
      keywords: [':vec:'],
      type: 'layer',
      layerType: 'vector',
      thumbnail:
        'https://images.unsplash.com/photo-1503785640985-f62e3aeee448?q=80&w=2074&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
      props: {
        style: 'https://omt.map-hosting.de/styles/baeume/style.json',
      },
    },
    {
      id: 'vecPOIs',
      name: 'vecPOIs',
      title: 'POIs',
      description: 'Vektor Layer der POIs',
      tags: ['Vector Karten', 'POIs'],
      keywords: [':vec:'],
      type: 'layer',
      layerType: 'vector',
      thumbnail:
        'https://images.unsplash.com/photo-1610562084360-0b617911f71f?q=80&w=1974&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
      props: {
        style: 'https://omt.map-hosting.de/styles/pois/style.json',
      },
    },
    {
      id: 'vecSolar',
      name: 'vecSolar',
      title: 'Solar',
      description: 'Vektor Layer der Solar Flächen',
      tags: ['Vector Karten', 'Solar'],
      keywords: [':vec:'],
      type: 'layer',
      layerType: 'vector',
      thumbnail:
        'https://images.unsplash.com/photo-1625301840055-7c1b7198cfc0?q=80&w=2071&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
      props: {
        style: 'https://omt.map-hosting.de/styles/solar/style.json',
      },
    },
  ],
};

export const topicMapsConfig: Config = {
  Title: 'Topic Maps',
  serviceName: 'wuppTopicMaps',
  layers: [
    {
      id: 'wuppTopic_stadtplan',
      name: 'wuppTopic_stadtplan',
      title: 'Online Stadtplan',
      description: `Interaktiver personalisierbarer Themenstadtplan für Wuppertal.`,
      tags: ['Topic Maps', 'Stadtplan'],
      type: 'link',
      thumbnail:
        'https://images.unsplash.com/photo-1618901882511-e7adb73a1ee0?q=80&w=2664&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',

      url: 'https://topicmaps-wuppertal.github.io/stadtplan/#/',
    },
    {
      id: 'wuppTopic_kultur',
      name: 'wuppTopic_kultur',
      title: 'Kulturstadtplan',
      description: `Interaktiver personalisierbarer Kulturstadtplan für Wuppertal.`,
      tags: ['Topic Maps', 'Stadtplan', 'Kultur'],
      type: 'link',
      thumbnail:
        'https://www.wuppertal.de/geoportal/signaturen/Fotos_POI/Fotostrecke_Schwebo/Schwebodrom_Aussenansicht.jpg',
      url: 'https://wunda-geoportal.cismet.de/#/kulturstadtplan',
    },
    {
      id: 'wuppTopic_baeder',
      name: 'wuppTopic_baeder',
      title: 'Bäderkarte',
      description: `Interaktive Kartenanwendung für die Schwimmbäder in Wuppertal.`,
      tags: ['Topic Maps', 'Bäder'],
      type: 'link',
      thumbnail:
        'https://images.unsplash.com/photo-1558617320-e695f0d420de?q=80&w=2070&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
      url: 'https://wunda-geoportal.cismet.de/#/baeder',
    },
    {
      id: 'wuppTopic_ebike',
      name: 'wuppTopic_ebike',
      title: 'Ladestationen E-Bikes',
      description: `Interaktive Kartenanwendung zu den Lade- und Verleihstationen für E-Fahrräder in Wuppertal.`,
      tags: ['Topic Maps', 'E-Bikes', 'Ladestationen'],
      type: 'link',
      thumbnail:
        'https://www.wuppertal.de/geoportal/emobil/raeder/fotos/akku_bauhaus_lichtscheid.jpg',

      url: 'https://wunda-geoportal.cismet.de/#/ebikes',
    },
    {
      id: 'wuppTopic_ehrenamt',
      name: 'wuppTopic_ehrenamt',
      title: 'Ehrenamtskarte',
      description: `Interaktive Kartenanwendung der Vermittlungsagentur "Zentrum für gute Taten e. V." für die erste Recherche nach Ehrenamtsstellen in Wuppertal .`,
      tags: ['Topic Maps', 'Ehrenamt'],
      type: 'link',
      thumbnail:
        'https://plus.unsplash.com/premium_photo-1663099733543-4c503251e501?q=80&w=2070&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
      url: 'https://wunda-geoportal.cismet.de/#/ehrenamt',
    },
    {
      id: 'wuppTopic_emobi',
      name: 'wuppTopic_emobi',
      title: 'Ladestationen E-Autos',
      description: `Interaktive Kartenanwendung für die E-Auto-Ladestationen in Wuppertal.`,
      tags: ['Topic Maps', 'E-Auto', 'Ladestationen'],
      type: 'link',
      thumbnail:
        'https://www.wuppertal.de/geoportal/emobil/autos/fotos/fertighauswelt.jpg',

      url: 'https://wunda-geoportal.cismet.de/#/elektromobilitaet?title',
    },
    {
      id: 'wuppTopic_kitas',
      name: 'wuppTopic_kitas',
      title: 'Kita-Finder',
      description: `Interaktive Kartenanwendung für die Recherche nach Kindertageseinrichtungen (Kitas) in Wuppertal - Spezialisierung des Online-Stadtplans Wuppertal mit spezifischen Filter- und Darstellungsoptionen.`,
      tags: ['Topic Maps', 'Kitas'],
      type: 'link',
      thumbnail:
        'https://images.unsplash.com/photo-1567746455504-cb3213f8f5b8?q=80&w=2670&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',

      url: 'https://wunda-geoportal.cismet.de/#/kitas',
    },
    {
      id: 'wuppTopic_xandride',
      name: 'wuppTopic_xandride',
      title: 'Park & Ride',
      description: `Interaktive Kartenanwendung zu den Park & Ride Standorten in Wuppertal.`,
      tags: ['Topic Maps', 'Park & Ride'],
      type: 'link',
      thumbnail:
        'https://www.wuppertal.de/geoportal/prbr/fotos/foto_bahnhof_barmen.jpg',
      url: 'https://wunda-geoportal.cismet.de/#/xandride',
    },
    {
      id: 'wuppTopic_wasserstoff',
      name: 'wuppTopic_wasserstoff',
      title: 'Wasserstofftankstellen',
      description: `Interaktive Kartenanwendung zu den Wasserstofftankstellen in Wuppertal.`,
      tags: ['Topic Maps', 'Tankstellen', 'Wasserstoff'],
      type: 'link',
      thumbnail:
        'https://www.wuppertal.de/geoportal/emobil/autos/fotos/wasserstoff_01.jpg',
      url: 'https://wunda-geoportal.cismet.de/#/meine/Wasserstoff-Tankstellenkarte_Wuppertal',
    },
    {
      id: 'wuppTopic_luftmessstationen',
      name: 'wuppTopic_luftmessstationen',
      title: 'Luftmessstationen',
      description: `Interaktive Kartenanwendung zu den Luftmessstationen in Wuppertal.`,
      tags: ['Topic Maps', 'Luftmessstationen'],
      type: 'link',
      thumbnail:
        'https://www.wuppertal.de/geoportal/luftmessstationen/fotos/MP31',
      url: 'https://topicmaps-wuppertal.github.io/luftmessstationen/',
    },
    {
      id: 'wuppTopic_klimaorte',
      name: 'wuppTopic_klimaorte',
      title: 'Klimaortkarte',
      description: `Interaktive Kartenanwendung für die Publikation von Best-Practice-Beispielen zum Klimaschutz in Wuppertal .`,
      tags: ['Topic Maps', 'Klimaorte'],
      type: 'link',
      thumbnail:
        'https://images.unsplash.com/photo-1548337138-e87d889cc369?q=80&w=2096&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
      url: 'https://topicmaps-wuppertal.github.io/klimaorte/#/',
    },
  ],
};

export const baseConfig = {
  karten: {
    Title: 'Basis',
    serviceName: 'wuppKarten',
    layers: [
      {
        name: 'R102:luftbild2022',
      },
      {
        name: 'R102:luftbild2020',
      },
      {
        name: 'R102:luftbild2018',
      },
      {
        name: 'R102:luftbild2016',
      },
      {
        name: 'R102:luftbild2014',
      },
      {
        name: 'R102:luftbild2012',
      },
      {
        name: 'R102:luftbild2010',
      },
      {
        name: 'R102:luftbild2007',
      },
      {
        name: 'R102:luftbild2005',
      },
      {
        name: 'R102:luftbild2002',
      },
      {
        name: 'R102:luftbild1997',
      },
      {
        name: 'R102:luftbild1991',
      },
      {
        name: 'R102:luftbild1985',
      },
      {
        name: 'R102:luftbild1979',
      },
      {
        name: 'R102:luftbild1928',
      },
      {
        name: 'R102:trueortho2022',
      },
      {
        name: 'R102:trueortho2020',
      },
      {
        name: 'R102:trueortho2018',
      },
      {
        name: 'spw2_orange',
      },
      {
        name: 'spw2_light',
      },
      {
        name: 'spw2_graublau',
      },
      {
        name: 'oepnv_rvr',
      },
      {
        name: 'abkf',
      },
      {
        name: 'abkg',
      },
      {
        name: 'abkt',
      },
      {
        name: 'alf',
      },
      {
        name: 'algw',
      },
      {
        name: 'alkomf',
      },
      {
        name: 'alkomgw',
      },
      {
        name: 'albsf',
      },
      {
        name: 'albsgw',
      },
      {
        name: 'expsw',
        pictureBoundingBox: [
          784874.5156892611, 6655868.893474152, 821182.1041247197,
          6679927.448126909,
        ],
      },
      {
        name: 'expg',
        pictureBoundingBox: [
          784874.5156892611, 6655868.893474152, 821182.1041247197,
          6679927.448126909,
        ],
      },
      {
        name: 'R102:UEK125',
        pictureBoundingBox: [
          784874.5156892611, 6655868.893474152, 821182.1041247197,
          6679927.448126909,
        ],
      },
      {
        name: 'R102:STADTRSW',
      },
      {
        name: 'R102:stadtgrundkarte_hausnr',
      },
      {
        name: 'urban',
      },
      {
        name: 'bplanreihe',
      },
      {
        name: 'bplanhintergrund',
      },
      {
        name: 'wuppertal:1827',
        pictureBoundingBox: [
          784874.5156892611, 6655868.893474152, 821182.1041247197,
          6679927.448126909,
        ],
      },
      {
        name: 'wuppertal:1929',
        pictureBoundingBox: [
          784874.5156892611, 6655868.893474152, 821182.1041247197,
          6679927.448126909,
        ],
      },
      {
        name: 'wuppertal:1979',
        pictureBoundingBox: [
          784874.5156892611, 6655868.893474152, 821182.1041247197,
          6679927.448126909,
        ],
      },
      {
        name: 'wuppertal:2004',
        pictureBoundingBox: [
          784874.5156892611, 6655868.893474152, 821182.1041247197,
          6679927.448126909,
        ],
      },
      {
        name: 'R102:DGK:schwarz',
      },
      {
        name: 'R102:DGK:gelb',
      },
      {
        name: 'R102:DGK:grau',
      },
      {
        name: 'R102:DGK:grau_nt',
      },
      {
        name: 'hillshade',
      },
    ],
  },
  Umwelt: {
    Title: 'Umwelt',
    serviceName: 'wuppUmwelt',
    layers: [
      {
        name: 'baeume',
        icon: 'Viereck_baumgruen',
        alternativeIcon: 'Viereck_baumgruen',
      },
      {
        name: 'kga',
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
      },
      {
        name: 'boden:radon',
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
      },
      {
        name: 'uschwemm_ermittelt',
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
      },
      {
        name: 'uschwemm_vor',
        pictureBoundingBox: [
          808524.6099721214, 6664293.687185457, 813466.7415821848,
          6667301.006517054,
        ],
      },
      {
        name: 'uschwemm_fest',
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
      },
      {
        name: 'gefahr_niedrig',
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
      },
      {
        name: 'gefahr_mittel',
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
      },
      {
        name: 'gefahr_hoch',
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
      },
      {
        name: 'risiko_niedrig',
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
      },
      {
        name: 'risiko_mittel',
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
      },
      {
        name: 'risiko_hoch',
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
      },
      {
        name: 'R102:50md',
      },
      {
        name: 'R102:50d',
      },
      {
        name: 'R102:50v',
      },
      {
        name: 'R102:100md',
      },
      {
        name: 'R102:100d',
      },
      {
        name: 'R102:100v',
      },
      {
        name: 'R102:90md',
      },
      {
        name: 'R102:90d',
      },
      {
        name: 'R102:90v',
      },
      {
        name: 'R102:SRmd',
      },
      {
        name: 'R102:SRd',
      },
      {
        name: 'R102:SRv',
      },
      {
        name: 'stadt:kompensationoe',
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
      },
      {
        name: 'naturdenkmale',
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
      },
      {
        name: 'Klimafunktion',
      },
      {
        name: 'Planhinweise',
      },
      {
        name: 'Nachtsituation',
      },
      {
        name: 'Tagsituation',
      },
      {
        name: 'Hitze-Ist',
      },
      {
        name: 'Hitze-Stark-Ist',
      },
      {
        name: 'Hitze-2050',
      },
      {
        name: 'Frischluftschneisen',
      },
      {
        name: 'Freiflaechen',
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
        icon: 'Viereck_freiflaechen',
        alternativeIcon: 'Viereck_freiflaechen',
      },
      {
        name: 'umweltzonen',
      },
      {
        name: 'uwz',
      },
      {
        name: 'no2',
      },
      {
        name: 'lugi2000',
      },
      {
        name: 'lugi1987',
      },
      {
        name: 'laerm2016:STR_RAST_DEN',
        pictureBoundingBox: [
          784621.3180330665, 6660622.321170634, 794304.9340539448,
          6666636.959833823,
        ],
      },
      {
        name: 'laerm2016:STR_RAST_NGT',
        pictureBoundingBox: [
          784621.3180330665, 6660622.321170634, 794304.9340539448,
          6666636.959833823,
        ],
      },
      {
        name: 'laerm2016:SCS_RAST_DEN',
        pictureBoundingBox: [
          793306.4753719696, 6664907.572068873, 802990.091392848,
          6670922.2107320605,
        ],
      },
      {
        name: 'laerm2016:SCS_RAST_NGT',
        pictureBoundingBox: [
          793306.4753719696, 6664907.572068873, 802990.091392848,
          6670922.2107320605,
        ],
      },
      {
        name: 'laerm2016:LDEN_BAHN',
        pictureBoundingBox: [
          793306.4753719696, 6664907.572068873, 802990.091392848,
          6670922.2107320605,
        ],
      },
      {
        name: 'laerm2016:LNIGHT_BAHN',
        pictureBoundingBox: [
          793306.4753719696, 6664907.572068873, 802990.091392848,
          6670922.2107320605,
        ],
      },
      {
        name: 'laerm2016:IND_RAST_DEN',
        pictureBoundingBox: [
          788913.734902706, 6663818.344415807, 793755.542913145,
          6666825.663747405,
        ],
      },
      {
        name: 'laerm2016:IND_RAST_NGT',
        pictureBoundingBox: [
          788913.734902706, 6663818.344415807, 793755.542913145,
          6666825.663747405,
        ],
      },
      {
        name: 'laerm2022:STR_RAST_DEN',
        pictureBoundingBox: [
          784621.3180330665, 6660622.321170634, 794304.9340539448,
          6666636.959833823,
        ],
      },
      {
        name: 'laerm2022:STR_RAST_NGT',
        pictureBoundingBox: [
          784621.3180330665, 6660622.321170634, 794304.9340539448,
          6666636.959833823,
        ],
      },
      {
        name: 'laerm2022:SCS_RAST_DEN',
        pictureBoundingBox: [
          793306.4753719696, 6664907.572068873, 802990.091392848,
          6670922.2107320605,
        ],
      },
      {
        name: 'laerm2022:SCS_RAST_NGT',
        pictureBoundingBox: [
          793306.4753719696, 6664907.572068873, 802990.091392848,
          6670922.2107320605,
        ],
      },
      {
        name: 'laerm:LDEN_BAHN_4',
        pictureBoundingBox: [
          793306.4753719696, 6664907.572068873, 802990.091392848,
          6670922.2107320605,
        ],
      },
      {
        name: 'laerm:LNIGHT_BAHN_4',
        pictureBoundingBox: [
          793306.4753719696, 6664907.572068873, 802990.091392848,
          6670922.2107320605,
        ],
      },
      {
        name: 'laerm2022:IND_RAST_DEN',
        pictureBoundingBox: [
          788913.734902706, 6663818.344415807, 793755.542913145,
          6666825.663747405,
        ],
      },
      {
        name: 'laerm2022:IND_RAST_NGT',
        pictureBoundingBox: [
          788913.734902706, 6663818.344415807, 793755.542913145,
          6666825.663747405,
        ],
      },
      {
        name: 'solar_year',
      },
      {
        name: 'solar_zy_photo',
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
      },
      {
        name: 'solar_zy_therm',
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
      },
      {
        name: 'solar_umring',
      },
      {
        name: 'solar_karte',
      },
    ],
  },
  POI: {
    Title: 'POI',
    serviceName: 'wuppPOI',
    layers: [
      {
        name: 'poi',
      },
      {
        name: 'poi_awg',
        pictureBoundingBox: [
          789024.8074594327, 6664703.341883925, 791171.0158942525,
          6666207.001549717,
        ],
        keywords: [
          ':vec:',
          'carmaConf://vectorStyle:https://tiles.cismet.de/poi/awg.style.json',
        ],
      },
      {
        name: 'poi_bahnhoefe',
        pictureBoundingBox: [
          794448.2534819795, 6665461.740523942, 796594.4619167992,
          6666965.400189739,
        ],
        keywords: [
          ':vec:',
          'carmaConf://vectorStyle:https://tiles.cismet.de/poi/bahnhofe.style.json',
        ],
      },
      {
        name: 'poi_behoerden',
        keywords: [
          ':vec:',
          'carmaConf://vectorStyle:https://tiles.cismet.de/poi/behorden.style.json',
        ],
      },
      {
        name: 'poi_bezirkssozialdienste',
        keywords: [
          ':vec:',
          'carmaConf://vectorStyle:https://tiles.cismet.de/poi/behorden.style.json',
        ],
      },
      {
        name: 'poi_bibliotheken',
        keywords: [
          ':vec:',
          'carmaConf://vectorStyle:https://tiles.cismet.de/poi/bibliotheken.style.json',
        ],
      },
      {
        name: 'poi_bildungseinrichtungen',
        keywords: [
          ':vec:',
          'carmaConf://vectorStyle:https://tiles.cismet.de/poi/bildungseinrichtungen.style.json',
        ],
      },
      {
        name: 'poi_haltestellen',
      },
      {
        name: 'poi_clubs',
        keywords: [
          ':vec:',
          'carmaConf://vectorStyle:https://tiles.cismet.de/poi/clubs.style.json',
        ],
      },
      {
        name: 'poi_dienstleistungsangebote',
        keywords: [
          ':vec:',
          'carmaConf://vectorStyle:https://tiles.cismet.de/poi/dienstleistungsangebote.style.json',
        ],
      },
      {
        name: 'poi_feuerwehr',
        pictureBoundingBox: [
          793881.5445769589, 6668348.432670274, 794954.6487943687,
          6669100.262503172,
        ],
      },
      {
        name: 'poi_filmtheater',
        pictureBoundingBox: [
          795040.6404511896, 6666030.24092181, 797186.8488860093,
          6667533.900587609,
        ],
      },
      {
        name: 'poi_freizeitsportangebote',
        pictureBoundingBox: [
          802349.9312809596, 6668144.202485324, 806642.348150599,
          6671151.521816919,
        ],
      },
      {
        name: 'poi_friedhofsverband',
        pictureBoundingBox: [
          802432.937116363, 6668932.459339514, 803506.0413337728,
          6669684.289172413,
        ],
      },
      {
        name: 'poi_friedhoefe',
        pictureBoundingBox: [
          792683.0358600187, 6666519.9156342605, 796975.4527296581,
          6669527.234965856,
        ],
        icon: 'Kreis_dunkelgruen',
        alternativeIcon: 'Icon_Friedhof',
      },
      {
        name: 'poi_friedhoefe_ehem',
        icon: 'Kreis_dunkelgruen',
        alternativeIcon: 'Icon_Friedhof',
      },
      {
        name: 'poi_gebaeude',
      },
      {
        name: 'poi_gruenanlagen',
        pictureBoundingBox: [
          792683.0358600187, 6666519.9156342605, 796975.4527296581,
          6669527.234965856,
        ],
        icon: 'Viereck_gruen',
        alternativeIcon: 'Icon_Gruenanlagen_und_Waelder',
      },
      {
        name: 'poi_stauseen',
        pictureBoundingBox: [
          799177.1974428413, 6659678.204438456, 800137.4376106737,
          6660409.730685716,
        ],
        icon: 'Kreis_gruen',
        alternativeIcon: 'Icon_Stausee',
      },
      {
        name: 'poi_wupperufer',
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
        icon: 'Kreis_gruen',
        alternativeIcon: 'Icon_Lebensader_Wupper',
      },
      {
        name: 'poi_jugend',
      },
      {
        name: 'poi_ksp',
      },
      {
        name: 'poi_kita',
      },
      {
        name: 'poi_kita_beh',
        pictureBoundingBox: [
          792683.0358600187, 6666519.9156342605, 796975.4527296581,
          6669527.234965856,
        ],
      },
      {
        name: 'poi_kirchen',
      },
      {
        name: 'poi_krankenhaeuser',
        pictureBoundingBox: [
          792683.0358600187, 6666519.9156342605, 796975.4527296581,
          6669527.234965856,
        ],
      },
      {
        name: 'poi_medien',
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
      },
      {
        name: 'poi_moscheen',
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
      },
      {
        name: 'poi_museen',
      },
      {
        name: 'poi_opunkte',
        pictureBoundingBox: [
          792683.0358600187, 6666519.9156342605, 796975.4527296581,
          6669527.234965856,
        ],
      },
      {
        name: 'poi_polizeidienststellen',
      },
      {
        name: 'poi_schulen',
      },
      {
        name: 'poi_schulen_grund',
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
      },
      {
        name: 'poi_schulen_gym',
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
      },
      {
        name: 'poi_schulen_real',
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
      },
      {
        name: 'poi_schulen_haupt',
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
      },
      {
        name: 'poi_schulen_gesamt',
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
      },
      {
        name: 'poi_schulen_forder',
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
      },
      {
        name: 'poi_schulen_andere',
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
      },
      {
        name: 'poi_schulen_beruf',
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
      },
      {
        name: 'poi_schwebebahnhaltestellen',
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
      },
      {
        name: 'poi_schwimmbaeder',
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
      },
      {
        name: 'poi_sehenswuerdigkeiten',
      },
      {
        name: 'poi_soziale',
      },
      {
        name: 'poi_sporthallen',
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
      },
      {
        name: 'poi_stadtverwaltung',
      },
      {
        name: 'poi_synagogen',
      },
      {
        name: 'poi_theater',
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
      },
      {
        name: 'poi_veranstaltungsorte',
      },
      {
        name: 'poi_wege',
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
      },
    ],
  },
  Planung: {
    Title: 'Planung',
    serviceName: 'wuppPlanung',
    layers: [
      {
        name: 'bverfahren-r',
      },
      {
        name: 'bverfahren-n',
        pictureBoundingBox: [
          790327.8199259817, 6664050.044157797, 794168.7805973117,
          6666976.149146838,
        ],
      },
      {
        name: 'innenr',
        pictureBoundingBox: [
          808586.7150576031, 6657920.749952179, 813165.7707833119,
          6660846.854941222,
        ],
      },
      {
        name: 'r102:fnp',
      },
      {
        name: 'r102:fnp_clip',
      },
      {
        name: 'r102:fnp_haupt_fl',
      },
      {
        name: 'r102:fnp_ngF',
        pictureBoundingBox: [
          795100.3568795373, 6660908.960026704, 797389.8847423919,
          6662372.012521227,
        ],
      },
      {
        name: 'Fnpaenderungsverfahren',
        pictureBoundingBox: [
          793980.0766837327, 6660217.443786437, 796269.6045465872,
          6661680.496280962,
        ],
      },
      {
        name: 'Fnpaenderungsverfahren-r',
        pictureBoundingBox: [
          793980.0766837327, 6660217.443786437, 796269.6045465872,
          6661680.496280962,
        ],
      },
      {
        name: 'Fnpaenderungsverfahren-n',
        pictureBoundingBox: [
          793980.0766837327, 6660217.443786437, 796269.6045465872,
          6661680.496280962,
        ],
      },
      {
        name: 'Fnpaenderungsverfahren-a',
        pictureBoundingBox: [
          793980.0766837327, 6660217.443786437, 796269.6045465872,
          6661680.496280962,
        ],
      },
      {
        name: 'landschaft:lundsschutz',
        pictureBoundingBox: [
          793980.0766837327, 6660217.443786437, 796269.6045465872,
          6661680.496280962,
        ],
      },
      {
        name: 'lplan:festsetzung',
        pictureBoundingBox: [
          790674.1752103989, 6660065.764058432, 795253.2309361077,
          6662991.869047475,
        ],
      },
      {
        name: 'lpnord:festsetzung',
        pictureBoundingBox: [
          786460.5840261785, 6664637.653812743, 788750.111889033,
          6666100.706307263,
        ],
      },
      {
        name: 'lpnord:entwicklung',
        pictureBoundingBox: [
          786460.5840261785, 6664637.653812743, 788750.111889033,
          6666100.706307263,
        ],
      },
      {
        name: 'lpost:festsetzung',
        pictureBoundingBox: [
          799296.0331352534, 6665023.421939869, 801585.5609981079,
          6666486.474434387,
        ],
      },
      {
        name: 'lpost:entwicklung',
        pictureBoundingBox: [
          799296.0331352534, 6665023.421939869, 801585.5609981079,
          6666486.474434387,
        ],
      },
      {
        name: 'lpgelpe:festsetzung',
        pictureBoundingBox: [
          798245.0239963323, 6661616.002538341, 799389.7879277592,
          6662347.528785604,
        ],
      },
      {
        name: 'lpgelpe:entwicklung',
        pictureBoundingBox: [
          798245.0239963323, 6661616.002538341, 799389.7879277592,
          6662347.528785604,
        ],
      },
      {
        name: 'lpwest:festsetzung',
        pictureBoundingBox: [
          792702.14511709, 6659814.95505937, 794991.6729799444,
          6661278.007553893,
        ],
      },
      {
        name: 'lpwest:entwicklung',
        pictureBoundingBox: [
          792702.14511709, 6659814.95505937, 794991.6729799444,
          6661278.007553893,
        ],
      },
      {
        name: 'baul',
        pictureBoundingBox: [
          801365.804541788, 6668672.095711919, 801671.5526549286,
          6668977.84382506,
        ],
      },
    ],
  },
  Infra: {
    Title: 'Infra',
    serviceName: 'wuppInfra',
    layers: [
      {
        name: 'apotheken',
        keywords: [
          ':vec:',
          'carmaConf://vectorStyle:https://tiles.cismet.de/apotheken/style.json',
        ],
      },
      {
        name: 'fernwaermewsw',
      },
      {
        name: 'schaechte',
        pictureBoundingBox: [
          801365.804541788, 6668672.095711919, 801671.5526549286,
          6668977.84382506,
        ],
      },
      {
        name: 'sc_txt',
        pictureBoundingBox: [
          801365.804541788, 6668672.095711919, 801671.5526549286,
          6668977.84382506,
        ],
      },
      {
        name: 'haltungen',
        pictureBoundingBox: [
          801365.804541788, 6668672.095711919, 801671.5526549286,
          6668977.84382506,
        ],
      },
      {
        name: 'ha_txt',
        pictureBoundingBox: [
          801365.804541788, 6668672.095711919, 801671.5526549286,
          6668977.84382506,
        ],
      },
      {
        name: 'sflaechen',
        pictureBoundingBox: [
          801365.804541788, 6668672.095711919, 801671.5526549286,
          6668977.84382506,
        ],
      },
      {
        name: 'fl_txt',
        pictureBoundingBox: [
          801365.804541788, 6668672.095711919, 801671.5526549286,
          6668977.84382506,
        ],
      },
    ],
  },
  Gebiet: {
    Title: 'Gebiet',
    serviceName: 'wuppGebiet',
    layers: [
      {
        name: 'R102:fluruebersicht',
      },
    ],
  },
  Verkehr: {
    Title: 'Mobilität',
    serviceName: 'wuppVerkehr',
    layers: [
      {
        name: 'einstr',
      },
    ],
  },
  Immo: {
    Title: 'Immo',
    serviceName: 'wuppImmo',
    layers: [
      {
        name: 'wohnlage2024',
      },
      {
        name: 'borisplus',
      },
      {
        name: 'borisimmo',
      },
      {
        name: 'wg_2020',
      },
      {
        name: 'wg_2010',
      },
      {
        name: 'wg_2000',
      },
      {
        name: 'wg_1990',
      },
      {
        name: 'wg_1980',
      },
      {
        name: 'wg_1970',
      },
      {
        name: 'wg_1960',
      },
      {
        name: 'wg_1949',
      },
      {
        name: 'wg_1919',
      },
      {
        name: 'wg',
      },
      {
        name: 'wg_unbek',
      },
      {
        name: 'nwg_2020',
      },
      {
        name: 'nwg_2010',
      },
      {
        name: 'nwg_2000',
      },
      {
        name: 'nwg_1990',
      },
      {
        name: 'nwg_1980',
      },
      {
        name: 'nwg_1970',
      },
      {
        name: 'nwg_1960',
      },
      {
        name: 'nwg_1949',
      },
      {
        name: 'nwg_1919',
      },
      {
        name: 'nwg',
      },
      {
        name: 'nwg_unbek',
      },
    ],
  },
  TopicMaps: {
    ...topicMapsConfig,
  },
  VectorMaps: {
    ...vectorConfig,
  },
};
