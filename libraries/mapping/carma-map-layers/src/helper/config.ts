import { customCategoryToLayers } from "./layerHelper";
import type { Config, LayerConfig, LayerProps } from "./types";

export const config = {
  Ortho: {
    title: "Orthofotos",
    layers: [
      {
        name: "R102:luftbild2022",
      },
      {
        name: "R102:luftbild2020",
      },
      {
        name: "R102:luftbild2018",
      },
      {
        name: "R102:luftbild2016",
      },
      {
        name: "R102:luftbild2014",
      },
      {
        name: "R102:luftbild2012",
      },
      {
        name: "R102:luftbild2010",
      },
      {
        name: "R102:luftbild2007",
      },
      {
        name: "R102:luftbild2005",
      },
      {
        name: "R102:luftbild2002",
      },
      {
        name: "R102:luftbild1997",
      },
      {
        name: "R102:luftbild1991",
      },
      {
        name: "R102:luftbild1985",
      },
      {
        name: "R102:luftbild1979",
      },
      {
        name: "R102:luftbild1928",
      },
      {
        name: "R102:trueortho2022",
      },
      {
        name: "R102:trueortho2020",
      },
      {
        name: "R102:trueortho2018",
      },
    ],
  },
  Starkregen: {
    layers: [
      {
        name: "R102:50md",
      },
      {
        name: "R102:50d",
      },
      {
        name: "R102:50v",
      },
      {
        name: "R102:100md",
      },
      {
        name: "R102:100d",
      },
      {
        name: "R102:100v",
      },
      {
        name: "R102:90md",
      },
      {
        name: "R102:90d",
      },
      {
        name: "R102:90v",
      },
      {
        name: "R102:SRmd",
      },
      {
        name: "R102:SRd",
      },
      {
        name: "R102:SRv",
      },
    ],
  },
  Lärmkarten: {
    layers: [
      {
        name: "laerm2016:STR_RAST_DEN",
        Title: "2016 Straßenverkehrslärm (LDEN)",
        pictureBoundingBox: [
          784621.3180330665, 6660622.321170634, 794304.9340539448,
          6666636.959833823,
        ],
      },
      {
        name: "laerm2016:STR_RAST_NGT",
        Title: "2016 Straßenverkehrslärm (LNIGHTtttt)",
        pictureBoundingBox: [
          784621.3180330665, 6660622.321170634, 794304.9340539448,
          6666636.959833823,
        ],
      },
      {
        name: "laerm2016:SCS_RAST_NGT",
        Title: "2016 Schienenverkehrslärm (LNIGHT)",
        pictureBoundingBox: [
          793306.4753719696, 6664907.572068873, 802990.091392848,
          6670922.2107320605,
        ],
      },
      {
        name: "laerm2016:IND_RAST_NGT",
        Title: "2016 Gewerbelärm (LNIGHT)",
        pictureBoundingBox: [
          788913.734902706, 6663818.344415807, 793755.542913145,
          6666825.663747405,
        ],
      },
      {
        name: "laerm2022:STR_RAST_DEN",
        Title: "2022 Straßenverkehrslärm (LDEN)",
        pictureBoundingBox: [
          784621.3180330665, 6660622.321170634, 794304.9340539448,
          6666636.959833823,
        ],
      },
      {
        name: "laerm2022:STR_RAST_NGT",
        Title: "2022 Straßenverkehrslärm (LNIGHT)",
        pictureBoundingBox: [
          784621.3180330665, 6660622.321170634, 794304.9340539448,
          6666636.959833823,
        ],
      },
      {
        name: "laerm2022:SCS_RAST_DEN",
        Title: "2022 Schienenverkehrslärm (LNIGHT)",
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
        name: "poi_schulen_grund",
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
      },
      {
        name: "poi_schulen_gym",
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
      },
      {
        name: "poi_schulen_real",
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
      },
      {
        name: "poi_schulen_haupt",
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
      },
      {
        name: "poi_schulen_gesamt",
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
      },
      {
        name: "poi_schulen_forder",
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
      },
      {
        name: "poi_schulen_andere",
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
      },
      {
        name: "poi_schulen_beruf",
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
    url: "https://maps.wuppertal.de/karten",
    name: "karten",
  },
  wuppUmwelt: {
    url: "https://maps.wuppertal.de/umwelt",
    name: "umwelt",
  },
  wuppInfra: {
    url: "https://maps.wuppertal.de/infra",
    name: "infra",
  },
  wuppPOI: {
    url: "https://maps.wuppertal.de/poi",
    name: "poi",
  },
  wuppPlanung: {
    url: "https://maps.wuppertal.de/planung",
    name: "planung",
  },
  wuppInspire: {
    url: "https://maps.wuppertal.de/inspire",
    name: "inspire",
  },
  wuppImmo: {
    url: "https://maps.wuppertal.de/immo",
    name: "immo",
  },
  wuppVerkehr: {
    url: "https://maps.wuppertal.de/verkehr",
    name: "verkehr",
  },
  wuppGebiet: {
    url: "https://maps.wuppertal.de/gebiet",
    name: "gebiet",
  },
  wuppTopicMaps: {
    type: "topicmaps",
    name: "topicmaps",
  },
  wuppVector: {
    name: "wuppVector",
  },
};

export const topicMapsConfig: Config = {
  Title: "Topic Maps",
  serviceName: "wuppTopicMaps",
  layers: [
    {
      id: "wuppTopic_stadtplan",
      name: "wuppTopic_stadtplan",
      title: "Online Stadtplan",
      description: `Interaktiver personalisierbarer Themenstadtplan für Wuppertal.`,
      tags: ["Topic Maps", "Stadtplan"],
      type: "link",
      thumbnail:
        "https://images.unsplash.com/photo-1618901882511-e7adb73a1ee0?q=80&w=2664&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",

      url: "https://topicmaps-wuppertal.github.io/stadtplan/#/",
    },
    {
      id: "wuppTopic_kultur",
      name: "wuppTopic_kultur",
      title: "Kulturstadtplan",
      description: `Interaktiver personalisierbarer Kulturstadtplan für Wuppertal.`,
      tags: ["Topic Maps", "Stadtplan", "Kultur"],
      type: "link",
      thumbnail:
        "https://www.wuppertal.de/geoportal/signaturen/Fotos_POI/Fotostrecke_Schwebo/Schwebodrom_Aussenansicht.jpg",
      url: "https://digital-twin-wuppertal-live.github.io/kulturstadtplan/",
    },
    {
      id: "wuppTopic_baeder",
      name: "wuppTopic_baeder",
      title: "Bäderkarte",
      description: `Interaktive Kartenanwendung für die Schwimmbäder in Wuppertal.`,
      tags: ["Topic Maps", "Bäder"],
      type: "link",
      thumbnail:
        "https://images.unsplash.com/photo-1558617320-e695f0d420de?q=80&w=2070&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
      url: "https://digital-twin-wuppertal-live.github.io/baederkarte/",
    },
    {
      id: "wuppTopic_ebike",
      name: "wuppTopic_ebike",
      title: "Ladestationen E-Bikes",
      description: `Interaktive Kartenanwendung zu den Lade- und Verleihstationen für E-Fahrräder in Wuppertal.`,
      tags: ["Topic Maps", "E-Bikes", "Ladestationen"],
      type: "link",
      thumbnail:
        "https://www.wuppertal.de/geoportal/emobil/raeder/fotos/akku_bauhaus_lichtscheid.jpg",

      url: "https://digital-twin-wuppertal-live.github.io/ebikes/",
    },
    {
      id: "wuppTopic_ehrenamt",
      name: "wuppTopic_ehrenamt",
      title: "Ehrenamtskarte",
      description: `Interaktive Kartenanwendung der Vermittlungsagentur "Zentrum für gute Taten e. V." für die erste Recherche nach Ehrenamtsstellen in Wuppertal .`,
      tags: ["Topic Maps", "Ehrenamt"],
      type: "link",
      thumbnail:
        "https://plus.unsplash.com/premium_photo-1663099733543-4c503251e501?q=80&w=2070&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
      url: "https://wunda-geoportal.cismet.de/#/ehrenamt",
    },
    {
      id: "wuppTopic_emobi",
      name: "wuppTopic_emobi",
      title: "E-Auto-Ladestationskarte",
      description: `Die E-Auto-Ladestationskarte Wuppertal ist eine im Auftrag der Stadt Wuppertal von der Firma cismet GmbH, Saarbrücken, betriebene interaktive Internet-Kartenanwendung, die dem Nutzer einen Überblick über die öffentlich zugänglichen Ladestationen für Elektro-Automobile im Wuppertaler Stadtgebiet verschafft.`,
      tags: [
        "TopicMap",
        "E-Auto-Ladestationen",
        "Verkehr",
        "Umwelt",
        "Elektro-Auto",
        "Elektromobilität",
        "E-Mobilität",
        "EmoTal",
      ],
      type: "link",
      thumbnail:
        "https://www.wuppertal.de/geoportal/emobil/autos/fotos/fertighauswelt.jpg",

      url: "https://digital-twin-wuppertal-live.github.io/elektromobilitaet/",
      keywords: [
        "carmaConf://opendata:https://offenedaten-wuppertal.de/dataset/ladestationen-e-autos-wuppertal/resource/46973470-98c9-4ba1-9b69-94358b9b22cb",
      ],
    },
    {
      id: "wuppTopic_kitas",
      name: "wuppTopic_kitas",
      title: "Kita-Finder",
      description: `Interaktive Kartenanwendung für die Recherche nach Kindertageseinrichtungen (Kitas) in Wuppertal - Spezialisierung des Online-Stadtplans Wuppertal mit spezifischen Filter- und Darstellungsoptionen.`,
      tags: ["Topic Maps", "Kitas"],
      type: "link",
      thumbnail:
        "https://images.unsplash.com/photo-1567746455504-cb3213f8f5b8?q=80&w=2670&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",

      url: "https://wunda-geoportal.cismet.de/#/kitas",
    },
    {
      id: "wuppTopic_xandride",
      name: "wuppTopic_xandride",
      title: "Park & Ride",
      description: `Interaktive Kartenanwendung zu den Park & Ride Standorten in Wuppertal.`,
      tags: ["Topic Maps", "Park & Ride"],
      type: "link",
      thumbnail:
        "https://www.wuppertal.de/geoportal/prbr/fotos/foto_bahnhof_barmen.jpg",
      url: "https://digital-twin-wuppertal-live.github.io/xandride/",
    },
    {
      id: "wuppTopic_wasserstoff",
      name: "wuppTopic_wasserstoff",
      title: "Wasserstofftankstellen",
      description: `Interaktive Kartenanwendung zu den Wasserstofftankstellen in Wuppertal.`,
      tags: ["Topic Maps", "Tankstellen", "Wasserstoff"],
      type: "link",
      thumbnail:
        "https://www.wuppertal.de/geoportal/emobil/autos/fotos/wasserstoff_01.jpg",
      url: "https://wunda-geoportal.cismet.de/#/meine/Wasserstoff-Tankstellenkarte_Wuppertal",
    },
    {
      id: "wuppTopic_luftmessstationen",
      name: "wuppTopic_luftmessstationen",
      title: "Luftmessstationen",
      description: `Interaktive Kartenanwendung zu den Luftmessstationen in Wuppertal.`,
      tags: ["Topic Maps", "Luftmessstationen"],
      type: "link",
      thumbnail:
        "https://www.wuppertal.de/geoportal/luftmessstationen/fotos/MP31",
      url: "https://digital-twin-wuppertal-live.github.io/luftmessstationen/",
    },
    {
      id: "wuppTopic_klimaorte",
      name: "wuppTopic_klimaorte",
      title: "Klimaortkarte",
      description: `Interaktive Kartenanwendung für die Publikation von Best-Practice-Beispielen zum Klimaschutz in Wuppertal .`,
      tags: ["Topic Maps", "Klimaorte"],
      type: "link",
      thumbnail:
        "https://images.unsplash.com/photo-1548337138-e87d889cc369?q=80&w=2096&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
      url: "https://topicmaps-wuppertal.github.io/klimaorte/#/",
    },
  ],
};

const vectorBaseUrl = "https://tiles.cismet.de/";

export const poiCategoryWithKeywords = {
  keywords: [],
  layers: [
    {
      name: "poi_bahnhoefe",
      pictureBoundingBox: [
        794448.2534819795, 6665461.740523942, 796594.4619167992,
        6666965.400189739,
      ],
      keywords: [
        ":vec:",
        "carmaConf://vectorStyle:https://tiles.cismet.de/poi/bahnhofe.style.json",
      ],
    },
    {
      name: "poi_behoerden",
      keywords: [
        ":vec:",
        "carmaConf://vectorStyle:https://tiles.cismet.de/poi/behorden.style.json",
      ],
    },
    {
      name: "poi_bezirkssozialdienste",
    },
    {
      name: "poi_bibliotheken",
      keywords: [
        ":vec:",
        "carmaConf://vectorStyle:https://tiles.cismet.de/poi/bibliotheken.style.json",
      ],
    },
    {
      name: "poi_bildungseinrichtungen",
      keywords: [
        ":vec:",
        "carmaConf://vectorStyle:https://tiles.cismet.de/poi/bildungseinrichtungen.style.json",
      ],
    },
    {
      name: "poi_haltestellen",
    },
    {
      name: "poi_clubs",
      keywords: [
        ":vec:",
        "carmaConf://vectorStyle:https://tiles.cismet.de/poi/clubs.style.json",
      ],
    },
    {
      name: "poi_dienstleistungsangebote",
      keywords: [
        ":vec:",
        "carmaConf://vectorStyle:https://tiles.cismet.de/poi/dienstleistungsangebote.style.json",
      ],
    },
    {
      name: "poi_feuerwehr",
      pictureBoundingBox: [
        793881.5445769589, 6668348.432670274, 794954.6487943687,
        6669100.262503172,
      ],
      keywords: [
        ":vec:",
        `carmaConf://vectorStyle:${vectorBaseUrl}poi/feuerwehrstandorte.style.json`,
      ],
    },
    {
      name: "poi_filmtheater",
      pictureBoundingBox: [
        795040.6404511896, 6666030.24092181, 797186.8488860093,
        6667533.900587609,
      ],
      keywords: [
        ":vec:",
        `carmaConf://vectorStyle:${vectorBaseUrl}poi/filmtheater.style.json`,
      ],
    },
    {
      name: "poi_freizeitsportangebote",
      pictureBoundingBox: [
        802349.9312809596, 6668144.202485324, 806642.348150599,
        6671151.521816919,
      ],
      keywords: [
        ":vec:",
        `carmaConf://vectorStyle:${vectorBaseUrl}poi/freizeitsportangebote.style.json`,
      ],
    },
    {
      name: "poi_friedhofsverband",
      pictureBoundingBox: [
        802432.937116363, 6668932.459339514, 803506.0413337728,
        6669684.289172413,
      ],
      keywords: [
        ":vec:",
        `carmaConf://vectorStyle:${vectorBaseUrl}poi/friedhofsverband-wuppertal.style.json`,
      ],
    },
    {
      name: "poi_friedhoefe",
      pictureBoundingBox: [
        792683.0358600187, 6666519.9156342605, 796975.4527296581,
        6669527.234965856,
      ],
      keywords: [
        ":vec:",
        `carmaConf://vectorStyle:${vectorBaseUrl}poi/friedhofe.style.json`,
      ],
      icon: "Kreis_dunkelgruen",
      alternativeIcon: "Icon_Friedhof",
    },
    {
      name: "poi_friedhoefe_ehem",
      keywords: [
        ":vec:",
        `carmaConf://vectorStyle:${vectorBaseUrl}poi/ehemalige-friedhofe.style.json`,
      ],
      icon: "Kreis_dunkelgruen",
      alternativeIcon: "Icon_Friedhof",
    },
    {
      name: "poi_gebaeude",
      keywords: [
        ":vec:",
        `carmaConf://vectorStyle:${vectorBaseUrl}poi/gebaude-und-bauwerke.style.json`,
      ],
    },
    {
      name: "poi_gruenanlagen",
      pictureBoundingBox: [
        792683.0358600187, 6666519.9156342605, 796975.4527296581,
        6669527.234965856,
      ],
      keywords: [
        ":vec:",
        `carmaConf://vectorStyle:${vectorBaseUrl}poi/grunanlagen-und-walder.style.json`,
      ],
      icon: "Viereck_gruen",
      alternativeIcon: "Icon_Gruenanlagen_und_Waelder",
    },
    {
      name: "poi_stauseen",
      pictureBoundingBox: [
        799177.1974428413, 6659678.204438456, 800137.4376106737,
        6660409.730685716,
      ],
      keywords: [
        ":vec:",
        `carmaConf://vectorStyle:${vectorBaseUrl}poi/stauseen-und-talsperren.style.json`,
      ],
      icon: "Kreis_gruen",
      alternativeIcon: "Icon_Stausee",
    },
    {
      name: "poi_wupperufer",
      pictureBoundingBox: [
        790989.4779520752, 6664143.201786021, 800673.0939729535,
        6670157.840449209,
      ],
      keywords: [
        ":vec:",
        `carmaConf://vectorStyle:${vectorBaseUrl}poi/wupperufer-lebensader-wupper.style.json`,
      ],
      icon: "Kreis_gruen",
      alternativeIcon: "Icon_Lebensader_Wupper",
    },
    {
      name: "poi_jugend",
      keywords: [
        ":vec:",
        `carmaConf://vectorStyle:${vectorBaseUrl}poi/jugend-und-kindertreffs.style.json`,
      ],
    },
    {
      name: "poi_ksp",
    },
    {
      name: "poi_kita",
      keywords: [
        ":vec:",
        `carmaConf://vectorStyle:${vectorBaseUrl}kita/style.json`,
      ],
    },
    {
      name: "poi_kita_beh",
      pictureBoundingBox: [
        792683.0358600187, 6666519.9156342605, 796975.4527296581,
        6669527.234965856,
      ],
      keywords: [
        ":vec:",
        `carmaConf://vectorStyle:${vectorBaseUrl}inklusion/style.json`,
      ],
    },
    {
      name: "poi_kirchen",
      keywords: [
        ":vec:",
        `carmaConf://vectorStyle:${vectorBaseUrl}poi/kirchen.style.json`,
      ],
    },
    {
      name: "poi_krankenhaeuser",
      pictureBoundingBox: [
        792683.0358600187, 6666519.9156342605, 796975.4527296581,
        6669527.234965856,
      ],
      keywords: [
        ":vec:",
        `carmaConf://vectorStyle:${vectorBaseUrl}poi/krankenhauser.style.json`,
      ],
    },
    {
      name: "poi_medien",
      pictureBoundingBox: [
        790989.4779520752, 6664143.201786021, 800673.0939729535,
        6670157.840449209,
      ],
      keywords: [
        ":vec:",
        `carmaConf://vectorStyle:${vectorBaseUrl}poi/medien.style.json`,
      ],
    },
    {
      name: "poi_moscheen",
      pictureBoundingBox: [
        790989.4779520752, 6664143.201786021, 800673.0939729535,
        6670157.840449209,
      ],
      keywords: [
        ":vec:",
        `carmaConf://vectorStyle:${vectorBaseUrl}poi/moscheen.style.json`,
      ],
    },
    {
      name: "poi_museen",
      keywords: [
        ":vec:",
        `carmaConf://vectorStyle:${vectorBaseUrl}poi/museen-und-galerien.style.json`,
      ],
    },
    {
      name: "poi_opunkte",
      pictureBoundingBox: [
        792683.0358600187, 6666519.9156342605, 796975.4527296581,
        6669527.234965856,
      ],
      keywords: [
        ":vec:",
        `carmaConf://vectorStyle:${vectorBaseUrl}poi/orientierungspunkte-und-begriffe.style.json`,
      ],
    },
    {
      name: "poi_polizeidienststellen",
      keywords: [
        ":vec:",
        `carmaConf://vectorStyle:${vectorBaseUrl}poi/polizeidienststellen.style.json`,
      ],
    },
    {
      name: "poi_schulen",
      keywords: [
        ":vec:",
        `carmaConf://vectorStyle:${vectorBaseUrl}schulen/schule.style.json`,
      ],
    },
    {
      name: "poi_schulen_grund",
      pictureBoundingBox: [
        790989.4779520752, 6664143.201786021, 800673.0939729535,
        6670157.840449209,
      ],
      keywords: [
        ":vec:",
        `carmaConf://vectorStyle:${vectorBaseUrl}schulen/grundschule.style.json`,
      ],
    },
    {
      name: "poi_schulen_gym",
      pictureBoundingBox: [
        790989.4779520752, 6664143.201786021, 800673.0939729535,
        6670157.840449209,
      ],
      keywords: [
        ":vec:",
        `carmaConf://vectorStyle:${vectorBaseUrl}schulen/gymnasium.style.json`,
      ],
    },
    {
      name: "poi_schulen_real",
      pictureBoundingBox: [
        790989.4779520752, 6664143.201786021, 800673.0939729535,
        6670157.840449209,
      ],
      keywords: [
        ":vec:",
        `carmaConf://vectorStyle:${vectorBaseUrl}schulen/realschule.style.json`,
      ],
    },
    {
      name: "poi_schulen_haupt",
      pictureBoundingBox: [
        790989.4779520752, 6664143.201786021, 800673.0939729535,
        6670157.840449209,
      ],
      keywords: [
        ":vec:",
        `carmaConf://vectorStyle:${vectorBaseUrl}schulen/hauptschule.style.json`,
      ],
    },
    {
      name: "poi_schulen_gesamt",
      pictureBoundingBox: [
        790989.4779520752, 6664143.201786021, 800673.0939729535,
        6670157.840449209,
      ],
      keywords: [
        ":vec:",
        `carmaConf://vectorStyle:${vectorBaseUrl}schulen/gesamtschule.style.json`,
      ],
    },
    {
      name: "poi_schulen_forder",
      pictureBoundingBox: [
        790989.4779520752, 6664143.201786021, 800673.0939729535,
        6670157.840449209,
      ],
      keywords: [
        ":vec:",
        `carmaConf://vectorStyle:${vectorBaseUrl}schulen/foerderschule.style.json`,
      ],
    },
    {
      name: "poi_schulen_andere",
      pictureBoundingBox: [
        790989.4779520752, 6664143.201786021, 800673.0939729535,
        6670157.840449209,
      ],
      keywords: [
        ":vec:",
        `carmaConf://vectorStyle:${vectorBaseUrl}schulen/andere.style.json`,
      ],
    },
    {
      name: "poi_schulen_beruf",
      pictureBoundingBox: [
        790989.4779520752, 6664143.201786021, 800673.0939729535,
        6670157.840449209,
      ],
      keywords: [
        ":vec:",
        `carmaConf://vectorStyle:${vectorBaseUrl}schulen/berufsbildende.style.json`,
      ],
    },
    {
      name: "poi_schwebebahnhaltestellen",
      pictureBoundingBox: [
        790989.4779520752, 6664143.201786021, 800673.0939729535,
        6670157.840449209,
      ],
      keywords: [
        ":vec:",
        `carmaConf://vectorStyle:${vectorBaseUrl}poi/schwebebahn-haltestellen.style.json`,
      ],
    },
    {
      name: "poi_schwimmbaeder",
      pictureBoundingBox: [
        790989.4779520752, 6664143.201786021, 800673.0939729535,
        6670157.840449209,
      ],
      keywords: [
        ":vec:",
        `carmaConf://vectorStyle:${vectorBaseUrl}poi/schwimmbader.style.json`,
      ],
    },
    {
      name: "poi_sehenswuerdigkeiten",
      keywords: [
        ":vec:",
        `carmaConf://vectorStyle:${vectorBaseUrl}poi/sehenswurdigkeiten.style.json`,
      ],
    },
    {
      name: "poi_soziale",
      keywords: [
        ":vec:",
        `carmaConf://vectorStyle:${vectorBaseUrl}poi/soziale-einrichtungen.style.json`,
      ],
    },
    {
      name: "poi_sporthallen",
      pictureBoundingBox: [
        790989.4779520752, 6664143.201786021, 800673.0939729535,
        6670157.840449209,
      ],
      keywords: [
        ":vec:",
        `carmaConf://vectorStyle:${vectorBaseUrl}poi/sporthallen-und-platze.style.json`,
      ],
    },
    {
      name: "poi_stadtverwaltung",
      keywords: [
        ":vec:",
        `carmaConf://vectorStyle:${vectorBaseUrl}poi/stadtverwaltung.style.json`,
      ],
    },
    {
      name: "poi_synagogen",
      keywords: [
        ":vec:",
        `carmaConf://vectorStyle:${vectorBaseUrl}poi/synagogen.style.json`,
      ],
    },
    {
      name: "poi_theater",
      pictureBoundingBox: [
        790989.4779520752, 6664143.201786021, 800673.0939729535,
        6670157.840449209,
      ],
      keywords: [
        ":vec:",
        `carmaConf://vectorStyle:${vectorBaseUrl}poi/theater.style.json`,
      ],
    },
    {
      name: "poi_veranstaltungsorte",
      keywords: [
        ":vec:",
        `carmaConf://vectorStyle:${vectorBaseUrl}poi/veranstaltungsorte.style.json`,
      ],
    },
    {
      name: "poi_wege",
      pictureBoundingBox: [
        790989.4779520752, 6664143.201786021, 800673.0939729535,
        6670157.840449209,
      ],
      keywords: [
        ":vec:",
        `carmaConf://vectorStyle:${vectorBaseUrl}poi/wege-und-platze.style.json`,
      ],
    },
    {
      name: "poi_trinkwasser",
      keywords: [
        ":vec:",
        `carmaConf://vectorStyle:${vectorBaseUrl}poi/trinkwasserbrunnen.style.json`,
      ],
    },
    {
      name: "poi_reisebus",
      keywords: [
        ":vec:",
        `carmaConf://vectorStyle:${vectorBaseUrl}poi/informationen-fur-reisebusse.style.json`,
      ],
    },
  ],
};

export const baseConfig = {
  karten: {
    Title: "Basis",
    serviceName: "wuppKarten",
    layers: [
      {
        name: "alf",
      },
      {
        name: "algw",
      },
      {
        name: "alkomf",
      },
      {
        name: "alkomgw",
      },
      {
        name: "albsf",
      },
      {
        name: "albsgw",
      },
      {
        name: "expsw",
        pictureBoundingBox: [
          784874.5156892611, 6655868.893474152, 821182.1041247197,
          6679927.448126909,
        ],
      },
      {
        name: "expg",
        pictureBoundingBox: [
          784874.5156892611, 6655868.893474152, 821182.1041247197,
          6679927.448126909,
        ],
      },
      {
        name: "abkf",
      },
      {
        name: "abkg",
      },
      {
        name: "abkt",
      },
      {
        name: "spw2_orange",
      },
      {
        name: "spw2_light",
      },
      {
        name: "spw2_graublau",
      },
      {
        name: "oepnv_rvr",
      },
      {
        name: "hillshade",
      },
      {
        name: "R102:UEK125",
        pictureBoundingBox: [
          784874.5156892611, 6655868.893474152, 821182.1041247197,
          6679927.448126909,
        ],
      },
      {
        name: "R102:STADTRSW",
      },
      {
        name: "R102:stadtgrundkarte_hausnr",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}sgk_hausnummern/style.json`,
        ],
      },
      {
        name: "urban",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}urbanAtlas/style.json`,
        ],
      },
      {
        name: "wuppertal:1827",
        pictureBoundingBox: [
          784874.5156892611, 6655868.893474152, 821182.1041247197,
          6679927.448126909,
        ],
      },
      {
        name: "wuppertal:1929",
        pictureBoundingBox: [
          784874.5156892611, 6655868.893474152, 821182.1041247197,
          6679927.448126909,
        ],
      },
      {
        name: "wuppertal:1979",
        pictureBoundingBox: [
          784874.5156892611, 6655868.893474152, 821182.1041247197,
          6679927.448126909,
        ],
      },
      {
        name: "wuppertal:2004",
        pictureBoundingBox: [
          784874.5156892611, 6655868.893474152, 821182.1041247197,
          6679927.448126909,
        ],
      },
      {
        name: "R102:DGK:schwarz",
      },
      {
        name: "R102:DGK:gelb",
      },
      {
        name: "R102:DGK:grau",
      },
      {
        name: "R102:DGK:grau_nt",
      },
      {
        name: "bplanreihe",
      },
      {
        name: "bplanhintergrund",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}bplanhintergrund/style.json`,
        ],
      },
      {
        name: "R102:trueortho2022",
      },
      {
        name: "R102:trueortho2020",
      },
      {
        name: "R102:trueortho2018",
      },

      {
        name: "R102:luftbild2022",
      },
      {
        name: "R102:luftbild2020",
      },
      {
        name: "R102:luftbild2018",
      },
      {
        name: "R102:luftbild2016",
      },
      {
        name: "R102:luftbild2014",
      },
      {
        name: "R102:luftbild2012",
      },
      {
        name: "R102:luftbild2010",
      },
      {
        name: "R102:luftbild2007",
      },
      {
        name: "R102:luftbild2005",
      },
      {
        name: "R102:luftbild2002",
      },
      {
        name: "R102:luftbild1997",
      },
      {
        name: "R102:luftbild1991",
      },
      {
        name: "R102:luftbild1985",
      },
      {
        name: "R102:luftbild1979",
      },
      {
        name: "R102:luftbild1928",
      },
    ],
  },
  Umwelt: {
    Title: "Umwelt",
    serviceName: "wuppUmwelt",
    layers: [
      {
        name: "baeume",
        icon: "Viereck_baumgruen",
        alternativeIcon: "Viereck_baumgruen",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}baeume/style.json`,
        ],
      },
      {
        name: "kga",
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
      },
      {
        name: "boden:radon",
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}radon/style.json`,
        ],
      },
      {
        name: "uschwemm_ermittelt",
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
      },
      {
        name: "uschwemm_vor",
        pictureBoundingBox: [
          808524.6099721214, 6664293.687185457, 813466.7415821848,
          6667301.006517054,
        ],
      },
      {
        name: "uschwemm_fest",
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
      },
      {
        name: "gefahr_niedrig",
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
      },
      {
        name: "gefahr_mittel",
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
      },
      {
        name: "gefahr_hoch",
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
      },
      {
        name: "risiko_niedrig",
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
      },
      {
        name: "risiko_mittel",
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
      },
      {
        name: "risiko_hoch",
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
      },
      {
        name: "R102:50md",
      },
      {
        name: "R102:50d",
      },
      {
        name: "R102:50v",
      },
      {
        name: "R102:100md",
      },
      {
        name: "R102:100d",
      },
      {
        name: "R102:100v",
      },
      {
        name: "R102:90md",
      },
      {
        name: "R102:90d",
      },
      {
        name: "R102:90v",
      },
      {
        name: "R102:SRmd",
      },
      {
        name: "R102:SRd",
      },
      {
        name: "R102:SRv",
      },
      {
        name: "Klimafunktion",
      },
      {
        name: "Planhinweise",
      },
      {
        name: "Nachtsituation",
      },
      {
        name: "Tagsituation",
      },
      {
        name: "Hitze-Ist",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}hitzeinsel/style.json`,
        ],
      },
      {
        name: "Hitze-Stark-Ist",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}starke_hitzeinsel/style.json`,
        ],
      },
      {
        name: "Hitze-2050",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}ausweitung_hitzeinsel/style.json`,
        ],
      },
      {
        name: "Frischluftschneisen",
      },
      {
        name: "Freiflaechen",
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
        icon: "Viereck_freiflaechen",
        alternativeIcon: "Viereck_freiflaechen",
      },
      {
        name: "umweltzonen",
      },
      {
        name: "uwz",
      },
      {
        name: "no2",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}luftmessstation/style.json`,
        ],
      },
      {
        name: "lugi2000",
      },
      {
        name: "lugi1987",
      },
      {
        name: "solar_year",
      },
      {
        name: "solar_zy_photo",
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}dachflaechenumringe/solarpotenzial_strom.style.json`,
        ],
      },
      {
        name: "solar_zy_therm",
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}dachflaechenumringe/solarpotenzial_waerme.style.json`,
        ],
      },
      {
        name: "solar_umring",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}dachflaechenumringe/dachflaechenumringe.style.json`,
        ],
      },
      {
        name: "solar_karte",
      },
      {
        name: "laerm2016:STR_RAST_DEN",
        pictureBoundingBox: [
          784621.3180330665, 6660622.321170634, 794304.9340539448,
          6666636.959833823,
        ],
      },
      {
        name: "laerm2016:STR_RAST_NGT",
        pictureBoundingBox: [
          784621.3180330665, 6660622.321170634, 794304.9340539448,
          6666636.959833823,
        ],
        keywords: [
          'carmaconf://infoBoxMapping:function createInfoBoxInfo(p) { const value = p.value === "-9999" ? "Kein Wert verfügbar!" : Math.round(p.value * 10) / 10 + " Dezibel (A)"; const info = { title: "Berechneter Dauerschallpegel: " + value, header: "Straßenverkehrslärm", }; return info; }',
        ],
      },
      {
        name: "laerm2016:SCS_RAST_DEN",
        pictureBoundingBox: [
          793306.4753719696, 6664907.572068873, 802990.091392848,
          6670922.2107320605,
        ],
      },
      {
        name: "laerm2016:SCS_RAST_NGT",
        pictureBoundingBox: [
          793306.4753719696, 6664907.572068873, 802990.091392848,
          6670922.2107320605,
        ],
      },
      {
        name: "laerm2016:LDEN_BAHN",
        pictureBoundingBox: [
          793306.4753719696, 6664907.572068873, 802990.091392848,
          6670922.2107320605,
        ],
      },
      {
        name: "laerm2016:LNIGHT_BAHN",
        pictureBoundingBox: [
          793306.4753719696, 6664907.572068873, 802990.091392848,
          6670922.2107320605,
        ],
      },
      {
        name: "laerm2016:IND_RAST_DEN",
        pictureBoundingBox: [
          788913.734902706, 6663818.344415807, 793755.542913145,
          6666825.663747405,
        ],
      },
      {
        name: "laerm2016:IND_RAST_NGT",
        pictureBoundingBox: [
          788913.734902706, 6663818.344415807, 793755.542913145,
          6666825.663747405,
        ],
      },
      {
        name: "laerm2022:STR_RAST_DEN",
        pictureBoundingBox: [
          784621.3180330665, 6660622.321170634, 794304.9340539448,
          6666636.959833823,
        ],
      },
      {
        name: "laerm2022:STR_RAST_NGT",
        pictureBoundingBox: [
          784621.3180330665, 6660622.321170634, 794304.9340539448,
          6666636.959833823,
        ],
      },
      {
        name: "laerm2022:SCS_RAST_DEN",
        pictureBoundingBox: [
          793306.4753719696, 6664907.572068873, 802990.091392848,
          6670922.2107320605,
        ],
      },
      {
        name: "laerm2022:SCS_RAST_NGT",
        pictureBoundingBox: [
          793306.4753719696, 6664907.572068873, 802990.091392848,
          6670922.2107320605,
        ],
      },
      {
        name: "laerm:LDEN_BAHN_4",
        pictureBoundingBox: [
          793306.4753719696, 6664907.572068873, 802990.091392848,
          6670922.2107320605,
        ],
      },
      {
        name: "laerm:LNIGHT_BAHN_4",
        pictureBoundingBox: [
          793306.4753719696, 6664907.572068873, 802990.091392848,
          6670922.2107320605,
        ],
      },
      {
        name: "laerm2022:IND_RAST_DEN",
        pictureBoundingBox: [
          788913.734902706, 6663818.344415807, 793755.542913145,
          6666825.663747405,
        ],
      },
      {
        name: "laerm2022:IND_RAST_NGT",
        pictureBoundingBox: [
          788913.734902706, 6663818.344415807, 793755.542913145,
          6666825.663747405,
        ],
      },
      {
        name: "stadt:kompensationoe",
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
      },
      {
        name: "naturdenkmale",
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
      },
    ],
  },
  POI: {
    Title: "POI",
    serviceName: "wuppPOI",
    layers: [
      {
        name: "poi",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}poi/style.json`,
        ],
      },
      {
        name: "poi_awg",
        pictureBoundingBox: [
          789024.8074594327, 6664703.341883925, 791171.0158942525,
          6666207.001549717,
        ],
        keywords: [
          ":vec:",
          "carmaConf://vectorStyle:https://tiles.cismet.de/poi/awg.style.json",
        ],
      },
      {
        name: "poi_bahnhoefe",
        pictureBoundingBox: [
          794448.2534819795, 6665461.740523942, 796594.4619167992,
          6666965.400189739,
        ],
        keywords: [
          ":vec:",
          "carmaConf://vectorStyle:https://tiles.cismet.de/poi/bahnhofe.style.json",
        ],
      },
      {
        name: "poi_behoerden",
        keywords: [
          ":vec:",
          "carmaConf://vectorStyle:https://tiles.cismet.de/poi/behorden.style.json",
        ],
      },
      {
        name: "poi_bezirkssozialdienste",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}poi/bezirkssozialdienste.style.json`,
        ],
      },
      {
        name: "poi_bibliotheken",
        keywords: [
          ":vec:",
          "carmaConf://vectorStyle:https://tiles.cismet.de/poi/bibliotheken.style.json",
        ],
      },
      {
        name: "poi_bildungseinrichtungen",
        keywords: [
          ":vec:",
          "carmaConf://vectorStyle:https://tiles.cismet.de/poi/bildungseinrichtungen.style.json",
        ],
      },
      {
        name: "poi_haltestellen",
      },
      {
        name: "poi_clubs",
        keywords: [
          ":vec:",
          "carmaConf://vectorStyle:https://tiles.cismet.de/poi/clubs.style.json",
        ],
      },
      {
        name: "poi_dienstleistungsangebote",
        keywords: [
          ":vec:",
          "carmaConf://vectorStyle:https://tiles.cismet.de/poi/dienstleistungsangebote.style.json",
        ],
      },
      {
        name: "poi_feuerwehr",
        pictureBoundingBox: [
          793881.5445769589, 6668348.432670274, 794954.6487943687,
          6669100.262503172,
        ],
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}poi/feuerwehrstandorte.style.json`,
        ],
      },
      {
        name: "poi_filmtheater",
        pictureBoundingBox: [
          795040.6404511896, 6666030.24092181, 797186.8488860093,
          6667533.900587609,
        ],
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}poi/filmtheater.style.json`,
        ],
      },
      {
        name: "poi_freizeitsportangebote",
        pictureBoundingBox: [
          802349.9312809596, 6668144.202485324, 806642.348150599,
          6671151.521816919,
        ],
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}poi/freizeitsportangebote.style.json`,
        ],
      },
      {
        name: "poi_friedhofsverband",
        pictureBoundingBox: [
          802432.937116363, 6668932.459339514, 803506.0413337728,
          6669684.289172413,
        ],
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}poi/friedhofsverband-wuppertal.style.json`,
        ],
      },
      {
        name: "poi_friedhoefe",
        pictureBoundingBox: [
          792683.0358600187, 6666519.9156342605, 796975.4527296581,
          6669527.234965856,
        ],
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}poi/friedhofe.style.json`,
        ],
        icon: "Kreis_dunkelgruen",
        alternativeIcon: "Icon_Friedhof",
      },
      {
        name: "poi_friedhoefe_ehem",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}poi/ehemalige-friedhofe.style.json`,
        ],
        icon: "Kreis_dunkelgruen",
        alternativeIcon: "Icon_Friedhof",
      },
      {
        name: "poi_gebaeude",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}poi/gebaude-und-bauwerke.style.json`,
        ],
      },
      {
        name: "poi_gruenanlagen",
        pictureBoundingBox: [
          792683.0358600187, 6666519.9156342605, 796975.4527296581,
          6669527.234965856,
        ],
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}poi/grunanlagen-und-walder.style.json`,
        ],
        icon: "Viereck_gruen",
        alternativeIcon: "Icon_Gruenanlagen_und_Waelder",
      },
      {
        name: "poi_jugend",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}poi/jugend-und-kindertreffs.style.json`,
        ],
      },
      {
        name: "poi_ksp",
      },
      {
        name: "poi_kita",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}kita/style.json`,
        ],
      },
      {
        name: "poi_kita_beh",
        pictureBoundingBox: [
          792683.0358600187, 6666519.9156342605, 796975.4527296581,
          6669527.234965856,
        ],
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}inklusion/style.json`,
        ],
      },
      {
        name: "poi_kirchen",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}poi/kirchen.style.json`,
        ],
      },
      {
        name: "poi_krankenhaeuser",
        pictureBoundingBox: [
          792683.0358600187, 6666519.9156342605, 796975.4527296581,
          6669527.234965856,
        ],
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}poi/krankenhauser.style.json`,
        ],
      },
      {
        name: "poi_medien",
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}poi/medien.style.json`,
        ],
      },
      {
        name: "poi_moscheen",
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}poi/moscheen.style.json`,
        ],
      },
      {
        name: "poi_museen",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}poi/museen-und-galerien.style.json`,
        ],
      },
      {
        name: "poi_opunkte",
        pictureBoundingBox: [
          792683.0358600187, 6666519.9156342605, 796975.4527296581,
          6669527.234965856,
        ],
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}poi/orientierungspunkte-und-begriffe.style.json`,
        ],
      },
      {
        name: "poi_polizeidienststellen",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}poi/polizeidienststellen.style.json`,
        ],
      },
      {
        name: "poi_reisebus",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}poi/informationen-fur-reisebusse.style.json`,
        ],
      },
      {
        name: "poi_schulen",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}schulen/schule.style.json`,
        ],
      },
      {
        name: "poi_schulen_grund",
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}schulen/grundschule.style.json`,
        ],
      },
      {
        name: "poi_schulen_gym",
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}schulen/gymnasium.style.json`,
        ],
      },
      {
        name: "poi_schulen_real",
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}schulen/realschule.style.json`,
        ],
      },
      {
        name: "poi_schulen_haupt",
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}schulen/hauptschule.style.json`,
        ],
      },
      {
        name: "poi_schulen_gesamt",
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}schulen/gesamtschule.style.json`,
        ],
      },
      {
        name: "poi_schulen_forder",
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}schulen/foerderschule.style.json`,
        ],
      },
      {
        name: "poi_schulen_andere",
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}schulen/andere.style.json`,
        ],
      },
      {
        name: "poi_schulen_beruf",
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}schulen/berufsbildende.style.json`,
        ],
      },
      {
        name: "poi_schwebebahnhaltestellen",
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}poi/schwebebahn-haltestellen.style.json`,
        ],
      },
      {
        name: "poi_schwimmbaeder",
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}poi/schwimmbader.style.json`,
        ],
      },
      {
        name: "poi_sehenswuerdigkeiten",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}poi/sehenswurdigkeiten.style.json`,
        ],
      },
      {
        name: "poi_soziale",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}poi/soziale-einrichtungen.style.json`,
        ],
      },
      {
        name: "poi_sporthallen",
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}poi/sporthallen-und-platze.style.json`,
        ],
      },
      {
        name: "poi_stadtverwaltung",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}poi/stadtverwaltung.style.json`,
        ],
      },
      {
        name: "poi_stauseen",
        pictureBoundingBox: [
          799177.1974428413, 6659678.204438456, 800137.4376106737,
          6660409.730685716,
        ],
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}poi/stauseen-und-talsperren.style.json`,
        ],
        icon: "Kreis_gruen",
        alternativeIcon: "Icon_Stausee",
      },
      {
        name: "poi_synagogen",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}poi/synagogen.style.json`,
        ],
      },
      {
        name: "poi_theater",
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}poi/theater.style.json`,
        ],
      },
      {
        name: "poi_trinkwasser",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}poi/trinkwasserbrunnen.style.json`,
        ],
      },
      {
        name: "poi_veranstaltungsorte",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}poi/veranstaltungsorte.style.json`,
        ],
      },
      {
        name: "poi_wege",
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}poi/wege-und-platze.style.json`,
        ],
      },
      {
        name: "poi_weihnacht",
      },
      {
        name: "poi_wupperufer",
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}poi/wupperufer-lebensader-wupper.style.json`,
        ],
        icon: "Kreis_gruen",
        alternativeIcon: "Icon_Lebensader_Wupper",
      },
    ],
  },
  Planung: {
    Title: "Planung",
    serviceName: "wuppPlanung",
    layers: [
      {
        name: "baul",
        pictureBoundingBox: [
          801365.804541788, 6668672.095711919, 801671.5526549286,
          6668977.84382506,
        ],
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}baulastnachweis/style.json`,
        ],
      },
      {
        name: "bverfahren-r",
      },
      {
        name: "bverfahren-n",
        pictureBoundingBox: [
          790327.8199259817, 6664050.044157797, 794168.7805973117,
          6666976.149146838,
        ],
      },
      {
        name: "innenr",
        pictureBoundingBox: [
          808586.7150576031, 6657920.749952179, 813165.7707833119,
          6660846.854941222,
        ],
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}innenbereichssatzungen/style.json`,
        ],
      },
      {
        name: "r102:fnp",
      },
      {
        name: "r102:fnp_clip",
      },
      {
        name: "r102:fnp_haupt_fl",
      },
      {
        name: "r102:fnp_ngF",
        pictureBoundingBox: [
          795100.3568795373, 6660908.960026704, 797389.8847423919,
          6662372.012521227,
        ],
      },
      {
        name: "Fnpaenderungsverfahren",
        pictureBoundingBox: [
          793980.0766837327, 6660217.443786437, 796269.6045465872,
          6661680.496280962,
        ],
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}fnp_aenderungsverfahren_alle/style.json`,
        ],
      },
      {
        name: "Fnpaenderungsverfahren-r",
        pictureBoundingBox: [
          793980.0766837327, 6660217.443786437, 796269.6045465872,
          6661680.496280962,
        ],
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}fnp_aenderungsverfahren_rv/style.json`,
        ],
      },
      {
        name: "Fnpaenderungsverfahren-n",
        pictureBoundingBox: [
          793980.0766837327, 6660217.443786437, 796269.6045465872,
          6661680.496280962,
        ],
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}fnp_aenderungsverfahren_iv/style.json`,
        ],
      },
      {
        name: "Fnpaenderungsverfahren-a",
        pictureBoundingBox: [
          793980.0766837327, 6660217.443786437, 796269.6045465872,
          6661680.496280962,
        ],
      },
      {
        name: "landschaft:lundsschutz",
        pictureBoundingBox: [
          793980.0766837327, 6660217.443786437, 796269.6045465872,
          6661680.496280962,
        ],
      },
      {
        name: "lplan:festsetzung",
        pictureBoundingBox: [
          790674.1752103989, 6660065.764058432, 795253.2309361077,
          6662991.869047475,
        ],
      },
      {
        name: "lpnord:festsetzung",
        pictureBoundingBox: [
          786460.5840261785, 6664637.653812743, 788750.111889033,
          6666100.706307263,
        ],
      },
      {
        name: "lpnord:entwicklung",
        pictureBoundingBox: [
          786460.5840261785, 6664637.653812743, 788750.111889033,
          6666100.706307263,
        ],
      },
      {
        name: "lpost:festsetzung",
        pictureBoundingBox: [
          799296.0331352534, 6665023.421939869, 801585.5609981079,
          6666486.474434387,
        ],
      },
      {
        name: "lpost:entwicklung",
        pictureBoundingBox: [
          799296.0331352534, 6665023.421939869, 801585.5609981079,
          6666486.474434387,
        ],
      },
      {
        name: "lpgelpe:festsetzung",
        pictureBoundingBox: [
          798245.0239963323, 6661616.002538341, 799389.7879277592,
          6662347.528785604,
        ],
      },
      {
        name: "lpgelpe:entwicklung",
        pictureBoundingBox: [
          798245.0239963323, 6661616.002538341, 799389.7879277592,
          6662347.528785604,
        ],
      },
      {
        name: "lpwest:festsetzung",
        pictureBoundingBox: [
          792702.14511709, 6659814.95505937, 794991.6729799444,
          6661278.007553893,
        ],
      },
      {
        name: "lpwest:entwicklung",
        pictureBoundingBox: [
          792702.14511709, 6659814.95505937, 794991.6729799444,
          6661278.007553893,
        ],
      },
      {
        name: "baudenkmale",
      },
      {
        name: "bodendenkmale",
      },
      {
        name: "denkmalbr",
      },
      {
        name: "denkmalbn",
      },
      {
        name: "stadtbhstr",
      },
      {
        name: "talachse",
      },
      {
        name: "teilraeume",
      },
      {
        name: "gruen",
      },
      {
        name: "gestalt",
      },
      {
        name: "gestaltn",
      },
      {
        name: "innenbandstadt",
      },
      {
        name: "srt1",
      },
      {
        name: "srt21",
      },
      {
        name: "srt22",
      },
      {
        name: "srt31",
      },
      {
        name: "srt32",
      },
      {
        name: "srt4",
      },
      {
        name: "srt5",
      },
      {
        name: "srt6",
      },
      {
        name: "srt7",
      },
      {
        name: "srt81",
      },
      {
        name: "srt82",
      },
      {
        name: "srt83",
      },
    ],
  },
  Infra: {
    Title: "Infra",
    serviceName: "wuppInfra",
    layers: [
      {
        name: "apotheken",
        keywords: [
          ":vec:",
          "carmaConf://vectorStyle:https://tiles.cismet.de/apotheken/style.json",
        ],
      },
      {
        name: "breitband_hk",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}breitbandausbau_fttb/style.json`,
        ],
      },
      {
        name: "container",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}containerstandorte/style.json`,
        ],
      },
      {
        name: "zvb",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}versorgungsbereiche/versorgungsbereiche.style.json`,
        ],
      },
      {
        name: "zvb-erw",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}versorgungsbereiche/erweiterungsbereiche.style.json`,
        ],
      },
      {
        name: "fernwaermewsw",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}fernwaermenetz/style.json`,
        ],
      },
      {
        name: "fernsued",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}geltungsbereich/style.json`,
        ],
      },
      {
        name: "belis_Masten",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}leuchten/style.json`,
        ],
      },
      {
        name: "eplusbest",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}bestehende_telefonica_anlagen/style.json`,
        ],
      },
      {
        name: "o2best",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}bestehende_o2_anlagen/style.json`,
        ],
      },
      {
        name: "tmobilebest",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}bestehende_telekom_anlagen/style.json`,
        ],
      },
      {
        name: "vodafonebest",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}bestehende_vodaphone_anlagen/style.json`,
        ],
      },
      {
        name: "belis_Leitungen",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}leitungen/style.json`,
        ],
      },
      {
        name: "fernsuedl",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}betriebsfertige_leitungen/style.json`,
        ],
      },
      {
        name: "belis_Masten_mit_e",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}masten_mit_anschluss/style.json`,
        ],
      },
      {
        name: "schaechte",
        pictureBoundingBox: [
          801365.804541788, 6668672.095711919, 801671.5526549286,
          6668977.84382506,
        ],
      },
      {
        name: "sc_txt",
        pictureBoundingBox: [
          801365.804541788, 6668672.095711919, 801671.5526549286,
          6668977.84382506,
        ],
      },
      {
        name: "haltungen",
        pictureBoundingBox: [
          801365.804541788, 6668672.095711919, 801671.5526549286,
          6668977.84382506,
        ],
      },
      {
        name: "ha_txt",
        pictureBoundingBox: [
          801365.804541788, 6668672.095711919, 801671.5526549286,
          6668977.84382506,
        ],
      },
      {
        name: "sflaechen",
        pictureBoundingBox: [
          801365.804541788, 6668672.095711919, 801671.5526549286,
          6668977.84382506,
        ],
      },
      {
        name: "fl_txt",
        pictureBoundingBox: [
          801365.804541788, 6668672.095711919, 801671.5526549286,
          6668977.84382506,
        ],
      },
    ],
  },
  Gebiet: {
    Title: "Gebiet",
    serviceName: "wuppGebiet",
    layers: [
      {
        name: "R102:fluruebersicht",
      },
      {
        name: "kst_landtagswahlkreise",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}landtagswahlkreise/style.json`,
        ],
      },
      {
        name: "kst_knoten",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}knoten/style.json`,
        ],
      },
      {
        name: "kst_segment",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}segmente/segmente.style.json`,
        ],
      },
      {
        name: "kst_segmenttypen",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}segmente/segmenttypen.style.json`,
        ],
      },
      {
        name: "kst_segment_hnr",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}segmente/segmente_mit_hsnr.style.json`,
        ],
      },
      {
        name: "kst_segment_steigung",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}segmente/mit_steigung.style.json`,
        ],
      },
      {
        name: "kst_baubloecke",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}baubloecke/style.json`,
        ],
      },
      {
        name: "kst_quartiere",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}quartiere/style.json`,
        ],
      },
      {
        name: "kst_stadtbezirk",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}stadtbezirk/style.json`,
        ],
      },
      {
        name: "kst_stadtgebiet",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}stadtgebiet/style.json`,
        ],
      },
      {
        name: "kst_statistische_bezirke",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}statistische_bezirke/style.json`,
        ],
      },
      {
        name: "kst_stimmbezirke",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}stimmbezirke/style.json`,
        ],
      },
      {
        name: "kst_kommunalwahlbezirke",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}kommunalwahlbezirke/style.json`,
        ],
      },
      {
        name: "kst_bundestagswahlkreise",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}bundestagswahlkreise/style.json`,
        ],
      },
    ],
  },
  Verkehr: {
    Title: "Mobilität",
    serviceName: "wuppVerkehr",
    layers: [
      {
        name: "einstr",
      },
      {
        name: "zone30",
      },
      {
        name: "sch30",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}tempo_30_schilder/style.json`,
        ],
      },
      {
        name: "vbel2020",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}verkehrsbelastung_2020/style.json`,
        ],
      },
      {
        name: "vbel2013",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}verkehrsbelastung_2013/style.json`,
        ],
      },
      {
        name: "emobil_auto",
      },
      {
        name: "carsharing",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}carsharing/style.json`,
        ],
      },
      {
        name: "bewohnerbereiche",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}bewohnerparkbereiche/style.json`,
        ],
      },
      {
        name: "bewohnerzonen",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}bewohnerparkzonen/style.json`,
        ],
      },
      {
        name: "cityparkflaechen",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}city_parkflaechen/style.json`,
        ],
      },
      {
        name: "cityzonen",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}city_parkzonen/style.json`,
        ],
      },
      {
        name: "pranlagen",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}br_pr_anlagen/pr.style.json`,
        ],
      },
      {
        name: "psa",
      },
      {
        name: "treppen",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}treppen/style.json`,
        ],
      },
      {
        name: "branlagen",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}br_pr_anlagen/br.style.json`,
        ],
      },
      {
        name: "rad-ein",
      },
      {
        name: "emobil_bike",
      },
      {
        name: "emobil_verleih",
      },
      {
        name: "rad-bel",
      },
      {
        name: "rad-stg",
      },
      {
        name: "rad-ast",
      },
      {
        name: "rad-sper",
      },
      {
        name: "rad-zun",
      },
      {
        name: "rad-bau",
      },
      {
        name: "rad-wst",
      },
      {
        name: "rad-w",
      },
      {
        name: "rad-nrw",
      },
      {
        name: "reitwege",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}reitwege/style.json`,
        ],
      },
    ],
  },
  Immo: {
    Title: "Immo",
    serviceName: "wuppImmo",
    layers: [
      {
        name: "wohnlage2024",
      },
      {
        name: "borisplus",
      },
      {
        name: "borisimmo",
      },
      {
        name: "wg_2020",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}wohngebaeude/2020.style.json`,
        ],
      },
      {
        name: "wg_2010",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}wohngebaeude/2019.style.json`,
        ],
      },
      {
        name: "wg_2000",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}wohngebaeude/2009.style.json`,
        ],
      },
      {
        name: "wg_1990",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}wohngebaeude/1999.style.json`,
        ],
      },
      {
        name: "wg_1980",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}wohngebaeude/1989.style.json`,
        ],
      },
      {
        name: "wg_1970",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}wohngebaeude/1979.style.json`,
        ],
      },
      {
        name: "wg_1960",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}wohngebaeude/1969.style.json`,
        ],
      },
      {
        name: "wg_1949",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}wohngebaeude/1959.style.json`,
        ],
      },
      {
        name: "wg_1919",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}wohngebaeude/1948.style.json`,
        ],
      },
      {
        name: "wg",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}wohngebaeude/1918.style.json`,
        ],
      },
      {
        name: "wg_unbek",
      },
      {
        name: "nwg_2020",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}nicht_wohngebaeude/2020.style.json`,
        ],
      },
      {
        name: "nwg_2010",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}nicht_wohngebaeude/2019.style.json`,
        ],
      },
      {
        name: "nwg_2000",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}nicht_wohngebaeude/2009.style.json`,
        ],
      },
      {
        name: "nwg_1990",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}nicht_wohngebaeude/1999.style.json`,
        ],
      },
      {
        name: "nwg_1980",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}nicht_wohngebaeude/1989.style.json`,
        ],
      },
      {
        name: "nwg_1970",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}nicht_wohngebaeude/1979.style.json`,
        ],
      },
      {
        name: "nwg_1960",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}nicht_wohngebaeude/1969.style.json`,
        ],
      },
      {
        name: "nwg_1949",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}nicht_wohngebaeude/1959.style.json`,
        ],
      },
      {
        name: "nwg_1919",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}nicht_wohngebaeude/1948.style.json`,
        ],
      },
      {
        name: "nwg",
        keywords: [
          ":vec:",
          `carmaConf://vectorStyle:${vectorBaseUrl}nicht_wohngebaeude/1918.style.json`,
        ],
      },
      {
        name: "nwg_unbek",
      },
    ],
  },
  TopicMaps: {
    ...topicMapsConfig,
  },
  // VectorMaps: {
  //   ...vectorConfig,
  // },
};
