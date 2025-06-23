import type { Config, LayerConfig } from "@carma-commons/types";
import trinkwasserbrunnenThumb from "../thumbnails/trinkwasserbrunnen.jpg";
import wohnlagenThumb from "../thumbnails/wonhlagen_topicmap.jpg";
import fnpThumb from "../thumbnails/fnp.png";
import hitzeThumb from "../thumbnails/hitze.png";
import bplanThumb from "../thumbnails/bplan.png";
import seilbahnThumb from "../thumbnails/seilbahn.png";

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
    name: "wuppKarten",
  },
  wuppUmwelt: {
    url: "https://maps.wuppertal.de/umwelt",
    name: "wuppUmwelt",
  },
  wuppInfra: {
    url: "https://maps.wuppertal.de/infra",
    name: "wuppInfra",
  },
  wuppPOI: {
    url: "https://maps.wuppertal.de/poi",
    name: "wuppPOI",
  },
  wuppPlanung: {
    url: "https://maps.wuppertal.de/planung",
    name: "wuppPlanung",
  },
  wuppInspire: {
    url: "https://maps.wuppertal.de/inspire",
    name: "wuppInspire",
  },
  wuppImmo: {
    url: "https://maps.wuppertal.de/immo",
    name: "wuppImmo",
  },
  wuppVerkehr: {
    url: "https://maps.wuppertal.de/verkehr",
    name: "wuppVerkehr",
  },
  wuppGebiet: {
    url: "https://maps.wuppertal.de/gebiet",
    name: "wuppGebiet",
  },
  wuppTopicMaps: {
    type: "topicmaps",
    name: "wuppTopicMaps",
  },
  wuppVector: {
    name: "wuppVector",
  },
};

export const topicMapsConfig: Config = {
  Title: "TopicMaps Wuppertal",
  id: "wuppTopicMaps",
  layers: [
    {
      id: "wuppTopicMaps_stadtplan",
      path: "TopicMaps Wuppertal",
      name: "wuppTopicMaps_stadtplan",
      title: "Online-Stadtplan",
      description: `Beschreibung:Der Online-Stadtplan Wuppertal ist eine im Auftrag der Stadt Wuppertal von der Firma cismet GmbH, Saarbrücken, betriebene interaktive Internet-Kartenanwendung zur Orientierung im Wuppertaler Stadtgebiet.`,
      tags: [
        "TopicMaps",
        "POI",
        "Bildung",
        "Erholung",
        "Gesundheit",
        "Kultur",
        "Mobilität",
        "Religion",
        "Sport",
        "Stadtbild",
      ],
      type: "link",
      thumbnail:
        "https://images.unsplash.com/photo-1618901882511-e7adb73a1ee0?q=80&w=2664&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",

      url: "https://digital-twin-wuppertal-live.github.io/stadtplan/#/",
      keywords: [
        "carmaConf://opendata:https://offenedaten-wuppertal.de/dataset/interessante-orte-poi-wuppertal/resource/5b3ccf53-0c84-474f-8d36-480ecbb8f789",
      ],
      serviceName: "wuppTopicMaps",
    },
    {
      id: "wuppTopicMaps_kultur",
      path: "TopicMaps Wuppertal",
      name: "wuppTopicMaps_kultur",
      title: "Kulturstadtplan",
      description: `Beschreibung: Der Kulturstadtplan Wuppertal ist eine im Auftrag der Stadt Wuppertal von der Firma cismet GmbH, Saarbrücken, betriebene interaktive Internet-Kartenanwendung, die dem Nutzer einen Überblick über die kulturellen Veranstaltungsorte im Wuppertaler Stadtgebiet verschafft.`,
      tags: [
        "TopicMaps",
        "POI",
        "Kultur",
        "Kino",
        "Museum",
        "Veranstaltungsort",
        "Club",
        "Theater",
        "Ausstellung",
        "Konzert",
        "Party",
      ],
      type: "link",
      thumbnail:
        "https://www.wuppertal.de/geoportal/signaturen/Fotos_POI/Fotostrecke_Schwebo/Schwebodrom_Aussenansicht.jpg",
      url: "https://digital-twin-wuppertal-live.github.io/kulturstadtplan/",
      keywords: [
        "carmaConf://opendata:https://offenedaten-wuppertal.de/dataset/veranstaltungsorte-wuppertal/resource/9876dad9-6092-461b-8b60-9ec7b3d62373",
      ],
      serviceName: "wuppTopicMaps",
    },
    {
      id: "wuppTopicMaps_baeder",
      path: "TopicMaps Wuppertal",
      name: "wuppTopicMaps_baeder",
      title: "Bäderkarte",
      description: `Beschreibung: Die Bäderkarte Wuppertal ist eine im Auftrag der Stadt Wuppertal von der Firma cismet GmbH, Saarbrücken, betriebene interaktive Internet-Kartenanwendung für die Recherche nach Schwimmbädern in Wuppertal.`,
      tags: [
        "TopicMaps",
        "POI",
        "Infrastruktur",
        "Bäder",
        "Schwimmbad",
        "Badeanstalt",
        "Freizeit",
        "Sportanlage",
      ],
      type: "link",
      thumbnail:
        "https://images.unsplash.com/photo-1558617320-e695f0d420de?q=80&w=2070&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
      url: "https://digital-twin-wuppertal-live.github.io/baederkarte/",
      serviceName: "wuppTopicMaps",
    },
    {
      id: "wuppTopicMaps_kitas",
      path: "TopicMaps Wuppertal",
      name: "wuppTopicMaps_kitas",
      title: "Kita-Finder",
      description: `Beschreibung: Der Kita-Finder Wuppertal ist eine im Auftrag der Stadt Wuppertal von der Firma cismet GmbH, Saarbrücken, betriebene interaktive Internet-Kartenanwendung für die erste Recherche nach Kindertageseinrichtungen (Kitas) in Wuppertal.`,
      tags: [
        "TopicMaps",
        "POI",
        "Kita",
        "Kindertageseinrichtung",
        "Kindertagesstätte",
        "Kindergarten",
        "Kinderbetreuung",
        "Betreuungsangebot",
      ],
      type: "link",
      thumbnail:
        "https://images.unsplash.com/photo-1567746455504-cb3213f8f5b8?q=80&w=2670&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",

      url: "https://digital-twin-wuppertal-live.github.io/kita-finder/",
      keywords: [
        "carmaConf://opendata:https://offenedaten-wuppertal.de/dataset/kindertageseinrichtungen-wuppertal/resource/fa848527-582f-46d8-ab57-c86295333c07",
      ],
      serviceName: "wuppTopicMaps",
    },
    {
      id: "wuppTopicMaps_fnp",
      path: "TopicMaps Wuppertal",
      name: "wuppTopicMaps_fnp",
      title: "FNP-Inspektor",
      description: `Beschreibung: Der FNP-Inspektor Wuppertal ist eine im Auftrag der Stadt Wuppertal von der Firma cismet GmbH, Saarbrücken, betriebene interaktive Internet-Kartenanwendung für die Orientierung im und die Informationsentnahme aus dem Wuppertaler Flächennutzungsplan vom 17.01.2005 (FNP), den Änderungsverfahren zum FNP sowie dem fortgeschriebenen Stand der flächenhaften FNP-Hauptnutzungen.`,
      tags: [
        "TopicMaps",
        "Planung",
        "städtebauliche Entwicklung",
        "Bodennutzung",
        "Planungsrecht",
        "Bauleitplanung",
        "vorbereitender Bauleitplan",
        "Flächennutzungsplan",
        "FNP-Änderungsverfahren",
      ],
      type: "link",
      thumbnail: fnpThumb,

      url: "https://digital-twin-wuppertal-live.github.io/fnp-inspektor/#/",
      keywords: [
        "carmaConf://opendata:https://offenedaten-wuppertal.de/dataset/laufende-fnp-%C3%A4nderungsverfahren-wuppertal/resource/ef3051ba-c658-4c32-b6bb-db4b23e1ee4a",
      ],
      serviceName: "wuppTopicMaps",
    },
    {
      id: "wuppTopicMaps_bplan",
      path: "TopicMaps Wuppertal",
      name: "wuppTopicMaps_bplan",
      title: "Online-B-Plan-Auskunft",
      description: `Beschreibung: Die Online-B-Plan-Auskunft Wuppertal ist eine im Auftrag der Stadt Wuppertal von der Firma cismet GmbH, Saarbrücken, betriebene interaktive Internet-Kartenanwendung für die schnelle Identifikation relevanter laufender oder rechtswirksamer Bebauungsplanverfahren (B-Pläne) im Stadtgebiet von Wuppertal sowie für den Download der zugehörigen PDF-Dokumente.`,
      tags: [
        "TopicMaps",
        "Planung",
        "Planungsrecht",
        "Bauleitplanung",
        "verbindlicher Bauleitplan",
        "Bebauungsplan",
        "Bebauungsplanverfahren",
        "Satzung",
        "städtebauliche Entwicklung",
        "Bodennutzung",
      ],
      type: "link",
      thumbnail: bplanThumb,
      copyright: "©iStockphoto.com/KSuhorukov",
      url: "https://digital-twin-wuppertal-live.github.io/bplan-auskunft/",
      keywords: [
        "carmaConf://opendata:https://offenedaten-wuppertal.de/dataset/rechtsverbindliche-bebauungspl%C3%A4ne-wuppertal/resource/367ce59c-3770-4edc-923b-8c4df35c8452",
      ],
      serviceName: "wuppTopicMaps",
    },
    {
      id: "wuppTopicMaps_xandride",
      path: "TopicMaps Wuppertal",
      name: "wuppTopicMaps_xandride",
      title: "Park+Ride-Karte",
      description: `Beschreibung: Die Park+Ride-Karte Wuppertal ist eine im Auftrag der Stadt Wuppertal von der Firma cismet GmbH, Saarbrücken, betriebene interaktive Internet-Kartenanwendung, die dem Nutzer einen Überblick über die Park+Ride- und Bike+Ride-Anlagen im Wuppertaler Stadtgebiet oder in dessen unmittelbarer Nähe verschafft.`,
      tags: [
        "TopicMaps",
        "Verkehr",
        "Radverkehr",
        "Parkmöglichkeit",
        "Parkplatz",
        "Park and Ride Anlage",
        "Bike and Ride Anlage",
        "P+R-Anlage",
        "B+R-Anlage",
        "Parkraumkonzept Wuppertal",
      ],
      type: "link",
      thumbnail:
        "https://www.wuppertal.de/geoportal/prbr/fotos/foto_bahnhof_barmen.jpg",
      url: "https://digital-twin-wuppertal-live.github.io/xandride/",
      keywords: [
        "carmaConf://opendata:https://offenedaten-wuppertal.de/dataset/bike-and-ride-anlagen-wuppertal/resource/5a8230b0-796d-4472-be89-11cefb2f65d5",
      ],
      serviceName: "wuppTopicMaps",
    },
    {
      id: "wuppTopicMaps_emobi",
      path: "TopicMaps Wuppertal",
      name: "wuppTopicMaps_emobi",
      title: "E-Auto-Ladestationskarte",
      description: `Beschreibung: Die E-Auto-Ladestationskarte Wuppertal ist eine im Auftrag der Stadt Wuppertal von der Firma cismet GmbH, Saarbrücken, betriebene interaktive Internet-Kartenanwendung, die dem Nutzer einen Überblick über die öffentlich zugänglichen Ladestationen für Elektro-Automobile im Wuppertaler Stadtgebiet verschafft.`,
      tags: [
        "TopicMaps",
        "Verkehr",
        "Umwelt",
        "E-Auto-Ladestationen",
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
      serviceName: "wuppTopicMaps",
    },
    {
      id: "wuppTopicMaps_ebike",
      path: "TopicMaps Wuppertal",
      name: "wuppTopicMaps_ebike",
      title: "E-Fahrrad-Karte",
      description: `Beschreibung: Die E-Fahrrad-Karte Wuppertal ist eine im Auftrag der Stadt Wuppertal von der Firma cismet GmbH, Saarbrücken, betriebene interaktive Internet-Kartenanwendung, die dem Nutzer einen Überblick über die öffentlich zugänglichen Lade- und Verleihstationen für Elektro-Fahrräder im Wuppertaler Stadtgebiet verschafft.`,
      tags: [
        "TopicMaps",
        "Verkehr",
        "Umwelt",
        "Elektromobilität",
        "E-Mobilität",
        "E-Bike",
        "Pedelec",
        " E-Fahrrad-Ladestationen",
        "E-Fahrrad-Verleih",
        "EmoTal",
      ],
      type: "link",
      thumbnail:
        "https://www.wuppertal.de/geoportal/emobil/raeder/fotos/akku_bauhaus_lichtscheid.jpg",
      keywords: [
        "carmaConf://opendata:https://offenedaten-wuppertal.de/dataset/ladestationen-e-fahrr%C3%A4der-wuppertal/resource/93189702-44da-438c-a04c-7cd00465fcb0",
      ],
      url: "https://digital-twin-wuppertal-live.github.io/ebikes/",
      serviceName: "wuppTopicMaps",
    },
    {
      id: "wuppTopicMaps_luftMess",
      path: "TopicMaps Wuppertal",
      name: "wuppTopicMaps_luftMess",
      title: "Luft-Messstationskarte",
      description: `Beschreibung: Die Luftmessstationskarte Wuppertal ist eine im Auftrag der Stadt Wuppertal von der Firma cismet GmbH, Saarbrücken, betriebene interaktive Internet-Kartenanwendung, mit der die Ergebnisdaten des Passivsammler-Netzwerkes zur Bestimmung der durchschnittlichen Stickstoffdioxid-Konzentration in der Luft öffentlich zugänglich gemacht werden. In den Passivsammlern reichert sich das Stickstoffdioxid über vier Wochen durch natürliche Diffusion an. Danach werden durch eine labortechnische Analyse monatliche Mittelwerte bestimmt. Die Luftmessstationskarte liefert daher keine aktuellen Luftqualitätsdaten.`,
      tags: [
        "TopicMaps",
        "Umwelt",
        "Verkehr",
        "Luftreinhaltung",
        "Immissionüberwachung",
        "Luftbelastung",
        "Luftqualität",
        "Stickstoffdioxid",
        "NO2-Messungen",
        "Passivsammler",
      ],
      type: "link",
      thumbnail:
        "https://www.wuppertal.de/geoportal/luftmessstationen/fotos/MP31",
      keywords: [
        "carmaConf://opendata:https://offenedaten-wuppertal.de/dataset/luftmessstationen-wuppertal-passivsammler/resource/a60821e2-1053-4380-adca-06fefb0e3ef2",
      ],
      url: "https://digital-twin-wuppertal-live.github.io/luftmessstationen/",
      serviceName: "wuppTopicMaps",
    },
    {
      id: "wuppTopicMaps_flooding",
      path: "TopicMaps Wuppertal",
      name: "wuppTopicMaps_flooding",
      title: "Hochwasser-Gefahrenkarte",
      description: `Beschreibung: Die Hochwassergefahrenkarte Wuppertal ist eine im Auftrag der Stadt Wuppertal von der Firma cismet GmbH betriebene interaktive Internet-Kartenanwendung zur Information der Öffentlichkeit zu Überflutungsrisiken im Zusammenhang mit Hochwasserereignissen.`,
      tags: [
        "TopicMaps",
        "Umwelt",
        "Klima",
        "Starkregen",
        "Risikogewässer",
        "Flusshochwasser",
        "maximale Wassertiefe",
        "Überschwemmungsgebiet",
        "Hochwasserprognose",
        "Hochwasserschutz",
      ],
      type: "link",
      thumbnail:
        "https://images.unsplash.com/photo-1580993777851-40514758f716?q=80&w=2669&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
      keywords: [
        "carmaConf://opendata:https://offenedaten-wuppertal.de/dataset/hochwassersimulationen-nrw/resource/2bd13c11-6ae4-4c92-a3c5-3d2897d8ab79",
      ],
      url: "https://digital-twin-wuppertal-live.github.io/floodingmap/",
      serviceName: "wuppTopicMaps",
    },
    {
      id: "wuppTopicMaps_rainhazard",
      path: "TopicMaps Wuppertal",
      name: "wuppTopicMaps_rainhazard",
      title: "Starkregen-Gefahrenkarte",
      description: `Beschreibung:	Die Starkregengefahrenkarte Wuppertal ist eine im Auftrag der Stadt Wuppertal von der Firma cismet GmbH, Saarbrücken, betriebene interaktive Internet-Kartenanwendung zur Information der Öffentlichkeit zu Überflutungsrisiken im Zusammenhang mit Starkregenereignissen. Sie stellt hierzu in einem 1m x 1m Raster in zwei umschaltbaren Kartenansichten maximale Wasserstände bzw. maximale Fließgeschwindigkeiten dar, die im Verlauf von simulierten Starkregenereignissen auftreten.`,
      tags: [
        "TopicMaps",
        "Umwelt",
        "Klima",
        "Starkregen",
        "Niederschlagswasser",
        "Regenwasserkanalisation",
        "Überflutung",
        "Simulation",
        "maximale Wassertiefe",
      ],
      type: "link",
      thumbnail:
        "https://images.unsplash.com/photo-1527766833261-b09c3163a791?q=80&w=2670&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
      keywords: [
        "carmaConf://opendata:https://offenedaten-wuppertal.de/dataset/starkregensimulation-wuppertal-sri-10-version-21-102022/resource/2707b0d7-4601-4b36-926e",
      ],
      url: "https://digital-twin-wuppertal-live.github.io/rainhazardmap/",
      serviceName: "wuppTopicMaps",
    },
    {
      id: "wuppTopicMaps_hitze",
      path: "TopicMaps Wuppertal",
      name: "wuppTopicMaps_hitze",
      title: "Hitze-Belastungskarte",
      description: `Beschreibung: Die Hitzebelastungskarte Wuppertal ist eine im Auftrag der Stadt Wuppertal von der Firma cismet GmbH, Saarbrücken, betriebene interaktive Internet-Kartenanwendung, mit der die Ergebnisse einer vom Ingenieurbüro K.PLAN Klima.Umwelt & Planung GmbH erarbeiteten Klimatopkartierung öffentlich zugänglich gemacht werden. Die Hitzebelastungskarte zeigt die im IST-Zustand durch Hitze belasteten oder stark belasteten Areale im Stadtgebiet sowie ein Zukunftsszenario der Hitzebelastungen für den Zeitraum 2050 bis 2060.`,
      tags: [
        "TopicMaps",
        "Umwelt",
        "Klima",
        "Klimawandel",
        "Klimatoptypen",
        "Modellberechnungen",
        "Hitzebelastung",
        "Zukunftsszenario",
        "Treibausgasemissionen",
      ],
      type: "link",
      thumbnail: hitzeThumb,
      url: "https://digital-twin-wuppertal-live.github.io/hitzeinderstadt/",
      serviceName: "wuppTopicMaps",
    },
    {
      id: "wuppTopicMaps_klimaorte",
      path: "TopicMaps Wuppertal",
      name: "wuppTopicMaps_klimaorte",
      title: "Klimaortkarte",
      description: `Beschreibung: Die Klimaortkarte Wuppertal ist eine im Auftrag der Stadt Wuppertal von der Firma cismet GmbH, Saarbrücken, betriebene interaktive Internet-Kartenanwendung zur Information der Öffentlichkeit über Best-Practice-Beispiele für den Klimaschutz in Wuppertal. Neben den punktförmig modellierten "Klimaorten" umfasst die Klimaortkarte mit den "Klimarouten" auch Vorschläge für Radtouren und Wanderungen, die viele dieser Klimaorte verbinden.`,
      tags: [
        "TopicMaps",
        "Umwelt",
        "Klimawandel",
        "Klimaschutz",
        "Solarenergie",
        "Windenergie",
        "Quartiersentwicklung",
        "Energieberatung",
        "Umweltbildung",
        "Nachhaltigkeit",
      ],
      type: "link",
      thumbnail:
        "https://images.unsplash.com/photo-1548337138-e87d889cc369?q=80&w=2096&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
      keywords: [
        "carmaConf://opendata:https://offenedaten-wuppertal.de/dataset/klimaorte-wuppertal/resource/18dd4a9c-a007-480b-bbde-77ece763e408",
      ],
      url: "https://digital-twin-wuppertal-live.github.io/klimaorte/",
      serviceName: "wuppTopicMaps",
    },
    {
      id: "wuppTopicMaps_trinkwasserbrunnen",
      path: "TopicMaps Wuppertal",
      name: "wuppGenericTopicMaps_trinkwasserbrunnen",
      title: "Trinkwasserbrunnen-Karte",
      description: `Beschreibung: Die Trinkwasserbrunnenkarte Wuppertal ist eine im Auftrag der Stadt Wuppertal von der Firma cismet GmbH, Saarbrücken, betriebene interaktive Internet-Kartenanwendung zur Information über die öffentlich zugänglichen Trinkwasserbrunnen im Wuppertaler Stadtgebiet.`,
      tags: [
        "Generic TopicMaps",
        "POI",
        "Infrastruktur",
        "Klimawandel",
        "Hitzewelle",
        "Trinkwasserversorgung",
        "Hitzeaktionsplan",
        "Trinkbrunnennetz",
        "Trinkwasserspender",
      ],
      type: "link",
      thumbnail: trinkwasserbrunnenThumb,
      keywords: [
        "carmaConf://opendata:https://offenedaten-wuppertal.de/dataset/trinkwasserbrunnen-wuppertal/resource/b0481158-b4f5-4a0b-bcf5-be24168e993c",
      ],
      url: "https://digital-twin-wuppertal-live.github.io/generic-topicmap/#/Trinkbrunnenkarte_Wuppertal",
      serviceName: "wuppTopicMaps",
    },
    {
      id: "wuppTopicMaps_wohnlagen",
      path: "TopicMaps Wuppertal",
      name: "wuppGenericTopicMaps_wohnlagen",
      title: "Wohnlagen-Karte",
      description: `Beschreibung: Die Wohnlagenkarte Wuppertal ist eine im Auftrag der Stadt Wuppertal von der Firma cismet GmbH, Saarbrücken, betriebene interaktive Internet-Kartenanwendung zur Ermittlung von Wohnlagen gemäß Nr. 6.9 des qualifizierten Mietspiegels der Stadt Wuppertal für die Ermittlung ortsüblicher Vergleichsmieten. Sie beruht auf der jährlich vom Gutachterausschuss für Grundstückswerte in der Stadt Wuppertal aktualisierten vierstufigen Klassifizierung der Wuppertaler Wohnlagen.`,
      tags: [
        "Generic TopicMaps",
        "Infrastruktur",
        "Gebäude",
        "Wohngebäude",
        "Wohnlage",
        "Lagequalität",
        "Mietspiegel",
        "Immobilienmarkt",
        "Gutachterausschuss",
      ],
      type: "link",
      thumbnail: wohnlagenThumb,
      keywords: [
        "carmaConf://opendata:https://offenedaten-wuppertal.de/dataset/wohnlagen-wuppertal/resource/610da804-fb6f-4be8-9cfd-5349c13c733f",
      ],
      url: "https://digital-twin-wuppertal-live.github.io/generic-topicmap/#/Wohnlagenkarte_Wuppertal",
      serviceName: "wuppTopicMaps",
    },
  ],
};

export const partianTwinConfig = {
  TopicMaps: topicMapsConfig,
  // ArcGISOnline: {
  //   Title: "ArcGIS Online",
  //   id: "wuppArcGisOnline",
  //   layers: [
  //     {
  //       id: "wuppArcGisOnline_seilbahn",
  //       path: "ArcGIS Online",
  //       name: "wuppArcGisOnline_seilbahn",
  //       title: "Seilbahnplanung BUGA 2031",
  //       description: `Beschreibung: 3D-Visualisierung der für die Bundesgartenschau 2031 geplanten Seilbahn zwischen dem Wuppertaler Zoo und der Königshöhe, Planungsstand 05/2025.`,
  //       tags: [
  //         "ArcGIS Online",
  //         "BUGA 2031",
  //         "Bundesgartenschau",
  //         "Kernareal",
  //         "Seilbahn",
  //         "Zoo",
  //         "Planung",
  //       ],
  //       type: "link",
  //       thumbnail: seilbahnThumb,
  //       url: "https://experience.arcgis.com/experience/a78e9ce521df42f5a0ac98389e90bca6?draft=true",
  //       serviceName: "wuppArcGisOnline",
  //     },
  //   ],
  // },
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
      keywords: [
        ":vec:",
        `carmaConf://vectorStyle:${vectorBaseUrl}kinderspielplatz/style.json`,
      ],
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
  POI: {
    Title: "POI",
    serviceName: "wuppPOI",
    layers: [
      {
        name: "poi",
        keywords: [":vec:"],
        icon: "poi/alle_interessanten_Orte",
      },
      {
        name: "poi_awg",
        pictureBoundingBox: [
          789024.8074594327, 6664703.341883925, 791171.0158942525,
          6666207.001549717,
        ],
        keywords: [":vec:"],
        icon: "poi/AWG",
      },
      {
        name: "poi_bahnhoefe",
        pictureBoundingBox: [
          794448.2534819795, 6665461.740523942, 796594.4619167992,
          6666965.400189739,
        ],
        keywords: [":vec:"],
        icon: "poi/Bahnhöfe",
      },
      {
        name: "poi_behoerden",
        keywords: [":vec:"],
        icon: "poi/Behörden",
      },
      {
        name: "poi_bezirkssozialdienste",
        keywords: [":vec:"],
        icon: "poi/Bezirkssozialdienste",
      },
      {
        name: "poi_bibliotheken",
        keywords: [":vec:"],
        icon: "poi/Bibliotheken",
      },
      {
        name: "poi_bildungseinrichtungen",
        keywords: [":vec:"],
        icon: "poi/Bildungseinrichtungen",
      },
      {
        name: "poi_clubs",
        keywords: [":vec:"],
        icon: "poi/Clubs",
      },
      {
        name: "poi_dienstleistungsangebote",
        keywords: [":vec:"],
        icon: "poi/Dienstleistungsangebot",
      },
      {
        name: "poi_feuerwehr",
        pictureBoundingBox: [
          793881.5445769589, 6668348.432670274, 794954.6487943687,
          6669100.262503172,
        ],
        keywords: [":vec:"],
        icon: "poi/Feuerwehrstandorte",
      },
      {
        name: "poi_filmtheater",
        pictureBoundingBox: [
          795040.6404511896, 6666030.24092181, 797186.8488860093,
          6667533.900587609,
        ],
        keywords: [":vec:"],
        icon: "poi/Filmtheater",
      },
      {
        name: "poi_freizeitsportangebote",
        pictureBoundingBox: [
          802349.9312809596, 6668144.202485324, 806642.348150599,
          6671151.521816919,
        ],
        keywords: [":vec:"],
        icon: "poi/Freizeitsportangebote",
      },
      {
        name: "poi_friedhofsverband",
        pictureBoundingBox: [
          802432.937116363, 6668932.459339514, 803506.0413337728,
          6669684.289172413,
        ],
        keywords: [":vec:"],
        icon: "poi/Friedhofsverband",
      },
      {
        name: "poi_friedhoefe",
        pictureBoundingBox: [
          792683.0358600187, 6666519.9156342605, 796975.4527296581,
          6669527.234965856,
        ],
        keywords: [":vec:"],
        icon: "poi/Friedhöfe",
      },
      {
        name: "poi_friedhoefe_ehem",
        keywords: [":vec:"],
        icon: "poi/Friedhöfe__ehem_Friedhöfe",
      },
      {
        name: "poi_gebaeude",
        keywords: [":vec:"],
        icon: "poi/Gebaeude_u_Bauwerke",
      },
      {
        name: "poi_gruenanlagen",
        pictureBoundingBox: [
          792683.0358600187, 6666519.9156342605, 796975.4527296581,
          6669527.234965856,
        ],
        keywords: [":vec:"],
        icon: "poi/Grünanlagen_u_Wälder",
      },
      {
        name: "poi_jugend",
        keywords: [":vec:"],
        icon: "poi/Jugend-_u_Kindertreffs",
      },
      {
        name: "poi_ksp",
        keywords: [":vec:"],
        icon: "poi/Kinderspielplätze_2022",
      },
      {
        name: "poi_kita",
        keywords: [":vec:"],
        icon: "poi/Kindertagesstätten",
      },
      {
        name: "poi_kita_beh",
        pictureBoundingBox: [
          792683.0358600187, 6666519.9156342605, 796975.4527296581,
          6669527.234965856,
        ],
        keywords: [":vec:"],
        icon: "poi/Einrichtungen_m_Schwerpkunkt_Inklusion",
      },
      {
        name: "poi_kirchen",
        keywords: [":vec:"],
        icon: "poi/Kirchen",
      },
      {
        name: "poi_krankenhaeuser",
        pictureBoundingBox: [
          792683.0358600187, 6666519.9156342605, 796975.4527296581,
          6669527.234965856,
        ],
        keywords: [":vec:"],
        icon: "poi/Krankenhäuser",
      },
      {
        name: "poi_medien",
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
        keywords: [":vec:"],
        icon: "poi/Medien",
      },
      {
        name: "poi_moscheen",
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
        keywords: [":vec:"],
        icon: "poi/Moscheen",
      },
      {
        name: "poi_museen",
        keywords: [":vec:"],
        icon: "poi/Museen_u_Galerien",
      },
      {
        name: "poi_opunkte",
        pictureBoundingBox: [
          792683.0358600187, 6666519.9156342605, 796975.4527296581,
          6669527.234965856,
        ],
        keywords: [":vec:"],
        icon: "poi/Orientierungspunkte_u_-begriffe",
      },
      {
        name: "poi_polizeidienststellen",
        keywords: [":vec:"],
        icon: "poi/Polizeidienststellen",
      },
      {
        name: "poi_reisebus",
        keywords: [":vec:"],
        icon: "poi/Informationen_f_Reisebusse",
      },
      {
        name: "poi_schulen",
        keywords: [":vec:"],
        icon: "poi/Schulen",
      },
      {
        name: "poi_schulen_grund",
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
        keywords: [":vec:"],
        icon: "poi/Grundschulen",
      },
      {
        name: "poi_schulen_gym",
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
        keywords: [":vec:"],
        icon: "poi/Gymnasien",
      },
      {
        name: "poi_schulen_real",
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
        keywords: [":vec:"],
        icon: "poi/Realschulen",
      },
      {
        name: "poi_schulen_haupt",
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
        keywords: [":vec:"],
        icon: "poi/Hauptschulen",
      },
      {
        name: "poi_schulen_gesamt",
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
        keywords: [":vec:"],
        icon: "poi/Gesamtschulen",
      },
      {
        name: "poi_schulen_forder",
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
        keywords: [":vec:"],
        icon: "poi/Förderschulen",
      },
      {
        name: "poi_schulen_andere",
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
        keywords: [":vec:"],
        icon: "poi/andere_Schulformen",
      },
      {
        name: "poi_schulen_beruf",
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
        keywords: [":vec:"],
        icon: "poi/Berufsbildende_Schulen",
      },
      {
        name: "poi_schwebebahnhaltestellen",
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
        keywords: [":vec:"],
        icon: "poi/Schwebebahnhaltestellen",
      },
      {
        name: "poi_schwimmbaeder",
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
        keywords: [":vec:"],
        icon: "poi/Schwimmbäder",
      },
      {
        name: "poi_sehenswuerdigkeiten",
        keywords: [":vec:"],
        icon: "poi/Sehenswuerdigkeiten",
      },
      {
        name: "poi_soziale",
        keywords: [":vec:"],
        icon: "poi/Sozialeeinrichtungen",
      },
      {
        name: "poi_sporthallen",
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
        keywords: [":vec:"],
        icon: "poi/Sporthallen_u_-plätze",
      },
      {
        name: "poi_stadtverwaltung",
        keywords: [":vec:"],
        icon: "poi/Stadtverwaltung",
      },
      {
        name: "poi_stauseen",
        pictureBoundingBox: [
          799177.1974428413, 6659678.204438456, 800137.4376106737,
          6660409.730685716,
        ],
        keywords: [":vec:"],
        icon: "poi/Stauseen-u_Talsperren",
      },
      {
        name: "poi_synagogen",
        keywords: [":vec:"],
        icon: "poi/Synagogen",
      },
      {
        name: "poi_theater",
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
        keywords: [":vec:"],
        icon: "poi/Theater",
      },
      {
        name: "poi_toiletten",
      },
      {
        name: "poi_trinkwasser",
        keywords: [":vec:"],
        icon: "poi/Trinkwasserbrunnen",
      },
      {
        name: "poi_veranstaltungsorte",
        keywords: [":vec:"],
        icon: "poi/Veranstaltungsorte",
      },
      {
        name: "poi_wege",
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
        keywords: [":vec:"],
        icon: "poi/Wege_u_Plätze",
      },
      {
        name: "poi_weihnacht",
        keywords: [":vec:"],
        icon: "poi/Weihnachtsmärkte",
      },
      {
        name: "poi_wochenmaerkte",
      },
      {
        name: "poi_wupperufer",
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
        keywords: [":vec:"],
        icon: "poi/Wupperufer- Lebensader_Wupper",
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
        keywords: [":vec:"],
        icon: "planung/Baunachweis",
      },
      {
        name: "bverfahren-r",
        keywords: [":vec:"],
        icon: "planung/BPlan_Verfahren_rechtsverbindlich",
      },
      {
        name: "bverfahren-n",
        pictureBoundingBox: [
          790327.8199259817, 6664050.044157797, 794168.7805973117,
          6666976.149146838,
        ],
        keywords: [":vec:"],
        icon: "planung/BPlan_Verfahren_im_Verfahren",
      },
      {
        name: "innenr",
        pictureBoundingBox: [
          808586.7150576031, 6657920.749952179, 813165.7707833119,
          6660846.854941222,
        ],
        keywords: [":vec:"],
        icon: "planung/BPlan_Innenraumsatzung",
      },
      {
        name: "r102:fnp",
        icon: "planung/FNP_2005_xplanung",
      },
      {
        name: "r102:fnp_clip",
        icon: "planung/FNP_2005_xplanung",
      },
      {
        name: "r102_fnp_haupt_fl",
        icon: "planung/FNP_aktualisierte_FNP-Arbeitskarte",
      },
      {
        name: "r102:fnp_ngF",
        pictureBoundingBox: [
          795100.3568795373, 6660908.960026704, 797389.8847423919,
          6662372.012521227,
        ],
        icon: "planung/FNP_aktuelle_Übernahme_nicht_genehmigte_Flächen",
      },
      {
        name: "Fnpaenderungsverfahren",
        pictureBoundingBox: [
          793980.0766837327, 6660217.443786437, 796269.6045465872,
          6661680.496280962,
        ],
        keywords: [":vec:"],
        icon: "planung/FNP_Änderungsverfahren_alle",
      },
      {
        name: "Fnpaenderungsverfahren-r",
        pictureBoundingBox: [
          793980.0766837327, 6660217.443786437, 796269.6045465872,
          6661680.496280962,
        ],
        keywords: [":vec:"],
        icon: "planung/FNP_Änderungsverfahren_rechtsverbindlich",
      },
      {
        name: "Fnpaenderungsverfahren-n",
        pictureBoundingBox: [
          793980.0766837327, 6660217.443786437, 796269.6045465872,
          6661680.496280962,
        ],
        keywords: [":vec:"],
        icon: "planung/FNP_Änderungsverfahren_im_Verfahren",
      },
      {
        name: "Fnpaenderungsverfahren-a",
        pictureBoundingBox: [
          793980.0766837327, 6660217.443786437, 796269.6045465872,
          6661680.496280962,
        ],
        icon: "planung/FNP_Änderungsverfahren_aufgehoben",
      },
      {
        name: "landschaft:lundsschutz",
        pictureBoundingBox: [
          793980.0766837327, 6660217.443786437, 796269.6045465872,
          6661680.496280962,
        ],
        icon: "planung/Landschaft-Naturschutz",
      },
      {
        name: "lplan:festsetzung",
        pictureBoundingBox: [
          790674.1752103989, 6660065.764058432, 795253.2309361077,
          6662991.869047475,
        ],
        icon: "planung/Festsetzungstext",
      },
      {
        name: "lpnord:festsetzung",
        pictureBoundingBox: [
          786460.5840261785, 6664637.653812743, 788750.111889033,
          6666100.706307263,
        ],
        icon: "planung/LPlan_Nord_Festsetzungskarte",
      },
      {
        name: "lpnord:entwicklung",
        pictureBoundingBox: [
          786460.5840261785, 6664637.653812743, 788750.111889033,
          6666100.706307263,
        ],
        icon: "planung/LPlan_Nord_Entwicklungskarte",
      },
      {
        name: "lpost:festsetzung",
        pictureBoundingBox: [
          799296.0331352534, 6665023.421939869, 801585.5609981079,
          6666486.474434387,
        ],
        icon: "planung/LPlan_Ost_Festsetzungskarte",
      },
      {
        name: "lpost:entwicklung",
        pictureBoundingBox: [
          799296.0331352534, 6665023.421939869, 801585.5609981079,
          6666486.474434387,
        ],
        icon: "planung/LPlan_Ost_Entwicklungskarte",
      },
      {
        name: "lpgelpe:festsetzung",
        pictureBoundingBox: [
          798245.0239963323, 6661616.002538341, 799389.7879277592,
          6662347.528785604,
        ],
        icon: "planung/LPlan_Gelpe_Festsetzungskarte",
      },
      {
        name: "lpgelpe:entwicklung",
        pictureBoundingBox: [
          798245.0239963323, 6661616.002538341, 799389.7879277592,
          6662347.528785604,
        ],
        icon: "planung/LPlan_Gelpe_Entwicklungskarte",
      },
      {
        name: "lpwest:festsetzung",
        pictureBoundingBox: [
          792702.14511709, 6659814.95505937, 794991.6729799444,
          6661278.007553893,
        ],
        icon: "planung/LPlan_West_Festsetzungskarte",
      },
      {
        name: "lpwest:entwicklung",
        pictureBoundingBox: [
          792702.14511709, 6659814.95505937, 794991.6729799444,
          6661278.007553893,
        ],
        icon: "planung/LPlan_West_Entwicklungskarte",
      },
      {
        name: "baudenkmale",
        icon: "planung/Baudenkmäler",
      },
      {
        name: "bodendenkmale",
        icon: "planung/Bodendenkmäler",
      },
      {
        name: "denkmalbr",
        icon: "planung/rechtsverb_Denkmalbereichsatzungen",
      },
      {
        name: "denkmalbn",
        icon: "planung/nicht_rechtsverb_Denkmalbereichsatzungen",
      },
      {
        name: "stadtbhstr",
        icon: "planung/Bundes-Hauptverkehrsstrassen",
      },
      {
        name: "talachse",
        icon: "planung/Talachse",
      },
      {
        name: "teilraeume",
        icon: "planung/Bedeutsame_Teileäume",
      },
      {
        name: "gruen",
        icon: "planung/Flächen_Grünanlagen",
      },
      {
        name: "gestalt",
        icon: "planung/rechtsverb_Erhaltungs-_u_Gestaltungssatzungen",
      },
      {
        name: "gestaltn",
        icon: "planung/nicht_rechtsverb_Erhaltungs-_u_Gestaltungssatzungen",
      },
      {
        name: "innenbandstadt",
        icon: "planung/InnenBandStadt_Wuppertal",
      },
      {
        name: "srt1",
        icon: "planung/Hochverdichtete_Kernlagen",
      },
      {
        name: "srt21",
        icon: "planung/Innerstädtische_Baublöcke-Innenhofbebauung",
      },
      {
        name: "srt22",
        icon: "planung/Innerstädtische_Baublöcke-grüne_Innenhofbebauung",
      },
      {
        name: "srt31",
        icon: "planung/Gemengelagen_Schwerpkt_Wohnen",
      },
      {
        name: "srt32",
        icon: "planung/Gemengelagen_Schwerpkt_Gewerbe",
      },
      {
        name: "srt4",
        icon: "planung/Hochhaussiedlungen_Clusterstrukturen-Moderne",
      },
      {
        name: "srt5",
        icon: "planung/Geschosswohnungsbau_Zeilenbauweise",
      },
      {
        name: "srt6",
        icon: "planung/Historischer_Siedlungsbau",
      },
      {
        name: "srt7",
        icon: "planung/Dörflich_u_kleinteilige_Strukturen",
      },
      {
        name: "srt81",
        icon: "planung/Innenstadtnahe_Villenviertel",
      },
      {
        name: "srt82",
        icon: "planung/Verdichtete_Einfamilienhausgebiete",
      },
      {
        name: "srt83",
        icon: "planung/Aufgelockerte_Einfamilienhausgebiete",
      },
    ],
  },
  Verkehr: {
    Title: "Verkehr",
    serviceName: "wuppVerkehr",
    layers: [
      {
        name: "einstr",
        icon: "mobi/Einbahnstrassen",
      },
      {
        name: "zone30",
        keywords: [":vec:"],
        icon: "mobi/Tempo_30_Zonen",
      },
      {
        name: "sch30",
        keywords: [":vec:"],
        icon: "mobi/Beschilderung_d_Tempo_30_Zonen",
      },
      {
        name: "vbel2020",
        keywords: [":vec:"],
        icon: "mobi/2020_Kfz-Verkehrsbelastung",
      },
      {
        name: "vbel2013",
        keywords: [":vec:"],
        icon: "mobi/2013_Kfz-Verkehrsbelastung",
      },
      {
        name: "emobil_auto",
        icon: "mobi/Ladestation_f_Elektroautos",
      },
      {
        name: "carsharing",
        keywords: [":vec:"],
        icon: "mobi/Carsharing",
      },
      {
        name: "bewohnerbereiche",
        keywords: [":vec:"],
        icon: "mobi/Bewohnerparkbereich",
      },
      {
        name: "bewohnerzonen",
        keywords: [":vec:"],
        icon: "mobi/Bewohnerparkzonen",
      },
      {
        name: "cityparkflaechen",
        keywords: [":vec:"],
        icon: "mobi/City-Parkflächen",
      },
      {
        name: "cityzonen",
        keywords: [":vec:"],
        icon: "mobi/City-Parkzonen",
      },
      {
        name: "pranlagen",
        keywords: [":vec:"],
        icon: "mobi/P+R-Anlagen",
      },
      {
        name: "psa",
        keywords: [":vec:"],
        icon: "mobi/Parkscheinautomaten",
      },
      {
        name: "treppen",
        keywords: [":vec:"],
        icon: "mobi/Treppen",
      },
      {
        name: "branlagen",
        keywords: [":vec:"],
        icon: "mobi/B+R-Anlagen",
      },
      {
        name: "rad-ein",
        icon: "mobi/Einbahnstrassen_Radfahrverkehrsnetz",
      },
      {
        name: "emobil_bike",
        icon: "mobi/Ladestation_f_Elektro-Fahrräder",
      },
      {
        name: "emobil_verleih",
        icon: "mobi/Verleih_f_Elektro-Fahrräder",
      },
      {
        name: "rad-bel",
        icon: "mobi/Beleuchtete_Strecken",
      },
      {
        name: "rad-stg",
        icon: "mobi/Steile_Streckenabschnitte",
      },
      {
        name: "rad-ast",
        icon: "mobi/Radabstellanlagen",
      },
      {
        name: "rad-sper",
        icon: "mobi/Einschränkungen_u_Sperrungen",
      },
      {
        name: "rad-zun",
        icon: "mobi/Zugang_z_Bahntrassenradwegen",
      },
      {
        name: "rad-bau",
        icon: "mobi/Markante_Bauwerke",
      },
      {
        name: "rad-wst",
        icon: "mobi/Radwegetyp_n_STVO-",
      },
      {
        name: "rad-w",
        icon: "mobi/Kommunale_Radwanderwege",
      },
      {
        name: "rad-nrw",
        icon: "mobi/NRW-Radwanderwege",
      },
      {
        name: "reitwege",
        keywords: [":vec:"],
        icon: "mobi/Reitwege",
      },
    ],
  },
  Umwelt: {
    Title: "Umwelt",
    serviceName: "wuppUmwelt",
    layers: [
      {
        name: "baeume",
        icon: "umwelt/Bäume",
        keywords: [":vec:"],
      },
      {
        name: "kga",
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
        keywords: [":vec:"],
        icon: "umwelt/kleingärten",
      },
      {
        name: "boden:radon",
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
        keywords: [":vec:", "carmaConf://minZoom:9"],
        icon: "umwelt/Radon_Potenzialkarte",
      },
      {
        name: "uschwemm_ermittelt",
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
        icon: "umwelt/ermittelte_Überschwemmungsgebiete",
      },
      {
        name: "uschwemm_vor",
        pictureBoundingBox: [
          808524.6099721214, 6664293.687185457, 813466.7415821848,
          6667301.006517054,
        ],
        icon: "umwelt/vorläufige_gesicherte_Überschwemmungsgebiete",
      },
      {
        name: "uschwemm_fest",
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
        icon: "umwelt/festgesetzte_Überschwemmungsgebiete",
      },
      {
        name: "gefahr_niedrig",
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
        icon: "umwelt/Wahrscheinlichkeiten_Überschwemmungsgrenzen",
      },
      {
        name: "gefahr_mittel",
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
        icon: "umwelt/Wahrscheinlichkeiten_Überschwemmungsgrenzen",
      },
      {
        name: "gefahr_hoch",
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
        icon: "umwelt/Wahrscheinlichkeiten_Überschwemmungsgrenzen",
      },
      {
        name: "risiko_niedrig",
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
        icon: "umwelt/Wahrscheinlichkeiten_Überschwemmungsgrenzen",
      },
      {
        name: "risiko_mittel",
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
        icon: "umwelt/Wahrscheinlichkeiten_Überschwemmungsgrenzen",
      },
      {
        name: "risiko_hoch",
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
        icon: "umwelt/Wahrscheinlichkeiten_Überschwemmungsgrenzen",
      },
      {
        name: "R102_50md",
        icon: "umwelt/Starkregen-SRI-6-max-Wassertiefe",
      },
      {
        name: "R102_50d",
        icon: "umwelt/Starkregen_Fliessrichtung",
      },
      {
        name: "R102_50v",
        icon: "umwelt/Starkregen_SRI_6-7_Fließgeschwindigkeit",
      },
      {
        name: "R102_100md",
        icon: "umwelt/Starkregen_SRI_6-7_max_Wassertiefe",
      },
      {
        name: "R102_100d",
        icon: "umwelt/Starkregen_Fliessrichtung",
      },
      {
        name: "R102_100v",
        icon: "umwelt/Starkregen_SRI_6-7_Fließgeschwindigkeit",
      },
      {
        name: "R102_90md",
        icon: "umwelt/Starkregen_SRI_10_max_Wassertiefe",
      },
      {
        name: "R102_90d",
        icon: "umwelt/Starkregen_Fliessrichtung",
      },
      {
        name: "R102_90v",
        icon: "umwelt/Starkregen_SRI_10_Fließgeschwindigkeit",
      },
      {
        name: "R102_SRmd",
        icon: "umwelt/Regen_v_29052018_Wassertiefe",
      },
      {
        name: "R102_SRd",
        icon: "umwelt/Starkregen_Fliessrichtung",
      },
      {
        name: "R102_SRv",
        icon: "umwelt/Regen_v_29052018_Fliessgeschwindigkeit",
      },
      {
        name: "Klimafunktion",
        icon: "umwelt/Klimafunktionskarte",
      },
      {
        name: "Planhinweise",
        icon: "umwelt/Planhinweiskarte_Klima",
      },
      {
        name: "Nachtsituation",
        icon: "umwelt/Wärmebild_Nachtsituation",
      },
      {
        name: "Tagsituation",
        icon: "umwelt/Wärmebild_Tagessituation",
      },
      {
        name: "Hitze-Ist",
        keywords: [":vec:"],
        icon: "umwelt/Hitzeinseln_Ist-Zustand",
      },
      {
        name: "Hitze-Stark-Ist",
        keywords: [":vec:"],
        icon: "umwelt/Starke_Hitzebelastung",
      },
      {
        name: "Hitze-2050",
        keywords: [":vec:"],
        icon: "umwelt/Ausweitung_Hitzebelastung_Zukunftsszenario_2050",
      },
      {
        name: "Frischluftschneisen",
        keywords: [":vec:"],
        icon: "umwelt/Luftleitbahnen",
      },
      {
        name: "Freiflaechen",
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
        keywords: [":vec:"],
        icon: "umwelt/Freiflächen",
      },
      {
        name: "umweltzonen",
        keywords: [":vec:"],
        icon: "umwelt/Umweltzonen",
      },
      {
        name: "uwz",
        keywords: [":vec:"],
        icon: "umwelt/Umweltzonen_TM",
      },
      {
        name: "no2",
        keywords: [":vec:"],
        icon: "umwelt/Luftmessstationen_Passivsammler",
      },
      {
        name: "lugi2000",
        keywords: [":vec:"],
        icon: "umwelt/Luftgüte_2000",
      },
      {
        name: "lugi1987",
        keywords: [":vec:"],
        icon: "umwelt/Luftgüte_1987",
      },
      {
        name: "solar_year",
        icon: "umwelt/Jahres-Solarpotenzial",
      },
      {
        name: "solar_zy_photo",
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
        keywords: [":vec:"],
        icon: "umwelt/Solarpotenzial_Dächer_Strom",
      },
      {
        name: "solar_zy_therm",
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
        keywords: [":vec:"],
        icon: "umwelt/Solarpotenzial_Dächer_Wärme",
      },
      {
        name: "solar_umring",
        keywords: [":vec:"],
        icon: "umwelt/Dachflächenumringung",
      },
      {
        name: "solar_karte",
        icon: "umwelt/Hintergrundkarte_Solar",
      },
      {
        name: "laerm2016:STR_RAST_DEN",
        pictureBoundingBox: [
          784621.3180330665, 6660622.321170634, 794304.9340539448,
          6666636.959833823,
        ],
        icon: "umwelt/2016_Str-verkehrslärm_LDEN",
      },
      {
        name: "laerm2016:STR_RAST_NGT",
        pictureBoundingBox: [
          784621.3180330665, 6660622.321170634, 794304.9340539448,
          6666636.959833823,
        ],
        icon: "umwelt/2016_Str-verkehrslärm_LNight",
      },
      {
        name: "laerm2016:SCS_RAST_DEN",
        pictureBoundingBox: [
          793306.4753719696, 6664907.572068873, 802990.091392848,
          6670922.2107320605,
        ],
        icon: "umwelt/2016_Schienenverkehrslärm_Schwebebahn_LDEN",
      },
      {
        name: "laerm2016:SCS_RAST_NGT",
        pictureBoundingBox: [
          793306.4753719696, 6664907.572068873, 802990.091392848,
          6670922.2107320605,
        ],
        icon: "umwelt/2016_Schienenverkehrslärm_Schwebebahn_LNight",
      },
      {
        name: "laerm2016:LDEN_BAHN",
        pictureBoundingBox: [
          793306.4753719696, 6664907.572068873, 802990.091392848,
          6670922.2107320605,
        ],
        icon: "umwelt/2016_Schienenverkehrslärm_Bundeseisenbahn_LDEN",
      },
      {
        name: "laerm2016:LNIGHT_BAHN",
        pictureBoundingBox: [
          793306.4753719696, 6664907.572068873, 802990.091392848,
          6670922.2107320605,
        ],
        icon: "umwelt/2016_Schienenverkehrslärm_Bundeseisenbahn_LNight",
      },
      {
        name: "laerm2016:IND_RAST_DEN",
        pictureBoundingBox: [
          788913.734902706, 6663818.344415807, 793755.542913145,
          6666825.663747405,
        ],
        icon: "umwelt/2016_Gewerbelärm_LDEN",
      },
      {
        name: "laerm2016:IND_RAST_NGT",
        pictureBoundingBox: [
          788913.734902706, 6663818.344415807, 793755.542913145,
          6666825.663747405,
        ],
        icon: "umwelt/2016_Gewerbelärm_LNight",
      },
      {
        name: "laerm2022:STR_RAST_DEN",
        pictureBoundingBox: [
          784621.3180330665, 6660622.321170634, 794304.9340539448,
          6666636.959833823,
        ],
        icon: "umwelt/2022_Str-verkehrslaerm_LDEN_Day_Ev_Night",
      },
      {
        name: "laerm2022:STR_RAST_NGT",
        pictureBoundingBox: [
          784621.3180330665, 6660622.321170634, 794304.9340539448,
          6666636.959833823,
        ],
        icon: "umwelt/2022_Str-verkehrslärm_LNight",
      },
      {
        name: "laerm2022:SCS_RAST_DEN",
        pictureBoundingBox: [
          793306.4753719696, 6664907.572068873, 802990.091392848,
          6670922.2107320605,
        ],
        icon: "umwelt/2022_Schienenverkehrslärm_Schwebebahn_LDEN",
      },
      {
        name: "laerm2022:SCS_RAST_NGT",
        pictureBoundingBox: [
          793306.4753719696, 6664907.572068873, 802990.091392848,
          6670922.2107320605,
        ],
        icon: "umwelt/2022_Schienenverkehrslärm_Schwebebahn_LNight",
      },
      {
        name: "laerm:LDEN_BAHN_4",
        pictureBoundingBox: [
          793306.4753719696, 6664907.572068873, 802990.091392848,
          6670922.2107320605,
        ],
        icon: "umwelt/2022_Schienenverkehrslärm_Bundeseisenbahn_LDEN",
      },
      {
        name: "laerm:LNIGHT_BAHN_4",
        pictureBoundingBox: [
          793306.4753719696, 6664907.572068873, 802990.091392848,
          6670922.2107320605,
        ],
        icon: "umwelt/2022_Schienenverkehrslärm_Bundeseisenbahn_LNight",
      },
      {
        name: "laerm2022:IND_RAST_DEN",
        pictureBoundingBox: [
          788913.734902706, 6663818.344415807, 793755.542913145,
          6666825.663747405,
        ],
        icon: "umwelt/2022_Gewerbelärm_LDEN",
      },
      {
        name: "laerm2022:IND_RAST_NGT",
        pictureBoundingBox: [
          788913.734902706, 6663818.344415807, 793755.542913145,
          6666825.663747405,
        ],
        icon: "umwelt/2022_Gewerbelärm_LNight",
      },
      {
        name: "stadt:kompensationoe",
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
        keywords: [":vec:"],
        icon: "umwelt/Veröffentlichte_Kompensationsflächen",
      },
      {
        name: "naturdenkmale",
        pictureBoundingBox: [
          790989.4779520752, 6664143.201786021, 800673.0939729535,
          6670157.840449209,
        ],
        icon: "umwelt/Naturdenkmale",
      },
    ],
  },
  Infra: {
    Title: "Infrastruktur",
    serviceName: "wuppInfra",
    layers: [
      {
        name: "apotheken",
        keywords: [":vec:"],
        icon: "infra/Apotheken",
      },
      {
        name: "breitband_hk",
        keywords: [":vec:"],
        icon: "infra/Breitbandausbau_Hauskoordinaten_FTTB",
      },
      {
        name: "container",
        keywords: [":vec:"],
        icon: "infra/Containerstandorte",
      },
      {
        name: "zvb",
        keywords: [":vec:"],
        icon: "infra/Zentrale_Versorgungsbereiche",
      },
      {
        name: "zvb-erw",
        keywords: [":vec:"],
        icon: "infra/Erweiterungsbereiche",
      },
      {
        name: "fernwaermewsw",
        keywords: [":vec:"],
        icon: "infra/Fernwärmenetz_WSW",
      },
      {
        name: "fernsued",
        keywords: [":vec:"],
        icon: "infra/Geltungsbereich",
      },
      {
        name: "belis_Masten",
        keywords: [":vec:"],
        icon: "infra/Leuchten",
      },
      {
        name: "eplusbest",
        keywords: [":vec:"],
        icon: "infra/Bestehende_Telefonica_Anlagen",
      },
      {
        name: "o2best",
        keywords: [":vec:"],
        icon: "infra/Bestehende_O2_Anlagen",
      },
      {
        name: "tmobilebest",
        keywords: [":vec:"],
        icon: "infra/Bestehende_Telekom_Anlagen",
      },
      {
        name: "vodafonebest",
        keywords: [":vec:"],
        icon: "infra/Bestehende_Vodafone_Anlagen",
      },
      {
        name: "belis_Leitungen",
        keywords: [":vec:"],
        icon: "infra/Leitungen",
      },
      {
        name: "fernsuedl",
        keywords: [":vec:"],
        icon: "infra/Betriebsfertige_Leitungen",
      },
      {
        name: "belis_Masten_mit_e",
        keywords: [":vec:"],
        icon: "infra/Masten_m_Anschluss",
      },
      {
        name: "schaechte",
        pictureBoundingBox: [
          801365.804541788, 6668672.095711919, 801671.5526549286,
          6668977.84382506,
        ],
        icon: "infra/Schächte",
      },
      {
        name: "sc_txt",
        pictureBoundingBox: [
          801365.804541788, 6668672.095711919, 801671.5526549286,
          6668977.84382506,
        ],
        icon: "infra/Schachttexte",
      },
      {
        name: "haltungen",
        pictureBoundingBox: [
          801365.804541788, 6668672.095711919, 801671.5526549286,
          6668977.84382506,
        ],
        icon: "infra/Haltungen",
      },
      {
        name: "ha_txt",
        pictureBoundingBox: [
          801365.804541788, 6668672.095711919, 801671.5526549286,
          6668977.84382506,
        ],
        icon: "infra/Haltungstexte",
      },
      {
        name: "sflaechen",
        pictureBoundingBox: [
          801365.804541788, 6668672.095711919, 801671.5526549286,
          6668977.84382506,
        ],
        icon: "infra/Entwässerungsflächen",
      },
      {
        name: "fl_txt",
        pictureBoundingBox: [
          801365.804541788, 6668672.095711919, 801671.5526549286,
          6668977.84382506,
        ],
        icon: "infra/Flächentexte",
      },
    ],
  },
  Immo: {
    Title: "Immobilien",
    serviceName: "wuppImmo",
    layers: [
      {
        name: "wohnlagen2025",
        keywords: [":vec:"],
        icon: "immo/Wohnlagen_2024",
      },
      {
        name: "wohnlage2024",
        icon: "immo/Wohnlagenkarte_2024",
      },
      {
        name: "wohnlagen2024",
        keywords: [":vec:"],
        icon: "immo/Wohnlagen_2024",
      },
      {
        name: "borisplus",
        icon: "immo/Bodenrichtwerte",
      },
      {
        name: "borisimmo",
        icon: "immo/Immobilienwerte",
      },
      {
        name: "wg_2020",
        keywords: [":vec:"],
        icon: "immo/Baujahre_ab_2020_Wohngeb.",
      },
      {
        name: "wg_2010",
        keywords: [":vec:"],
        icon: "immo/Baujahre_2010-2019_Wohngeb.",
      },
      {
        name: "wg_2000",
        keywords: [":vec:"],
        icon: "immo/Baujahre_2000-2009_Wohngeb.",
      },
      {
        name: "wg_1990",
        keywords: [":vec:"],
        icon: "immo/Baujahre_1990-1999_Wohngeb.",
      },
      {
        name: "wg_1980",
        keywords: [":vec:"],
        icon: "immo/Baujahre_1980-1989_Wohngeb.",
      },
      {
        name: "wg_1970",
        keywords: [":vec:"],
        icon: "immo/Baujahre_1970-1979_Wohngeb",
      },
      {
        name: "wg_1960",
        keywords: [":vec:"],
        icon: "immo/Baujahre_1960-1969_Wohngeb.",
      },
      {
        name: "wg_1949",
        keywords: [":vec:"],
        icon: "immo/Baujahre_1949-1959_Wohngeb.",
      },
      {
        name: "wg_1919",
        keywords: [":vec:"],
        icon: "immo/Baujahr_1919-1948_Wohngeb.",
      },
      {
        name: "wg",
        keywords: [":vec:"],
        icon: "immo/Baujahre_bis_1918_Wohngeb",
      },
      {
        name: "wg_unbek",
        keywords: [":vec:"],
        icon: "immo/Baujahre_unbekannt_Wohngeb.",
      },
      {
        name: "nwg_2020",
        keywords: [":vec:"],
        icon: "immo/Baujahre_ab_2020_nicht-Wohngeb.",
      },
      {
        name: "nwg_2010",
        keywords: [":vec:"],
        icon: "immo/Baujahre_2010-2019_nicht-Wohngeb.",
      },
      {
        name: "nwg_2000",
        keywords: [":vec:"],
        icon: "immo/Baujahre_2000-2009_nicht-Wohngeb.",
      },
      {
        name: "nwg_1990",
        keywords: [":vec:"],
        icon: "immo/Baujahre_1990-1999_nicht-Wohngeb.",
      },
      {
        name: "nwg_1980",
        keywords: [":vec:"],
        icon: "immo/Baujahre_1980-1989_nicht-Wohngeb.",
      },
      {
        name: "nwg_1970",
        keywords: [":vec:"],
        icon: "immo/Baujahre_1970-1979_nicht_Wohngeb.",
      },
      {
        name: "nwg_1960",
        keywords: [":vec:"],
        icon: "immo/Baujahre_1960-1969_nicht-Wohngeb.",
      },
      {
        name: "nwg_1949",
        keywords: [":vec:"],
        icon: "immo/Baujahre_1949-1959_nicht-Wohngeb.",
      },
      {
        name: "nwg_1919",
        keywords: [":vec:"],
        icon: "immo/Baujahre_1919-1948_nicht-Wohngeb.",
      },
      {
        name: "nwg",
        keywords: [":vec:"],
        icon: "immo/Baujahre_bis_1918_nicht-Wohngeb",
      },
      {
        name: "nwg_unbek",
        keywords: [":vec:"],
        icon: "immo/Baujahre_unbekannt_nicht-Wohngeb.",
      },
    ],
  },
  Gebiet: {
    Title: "Gebiete",
    serviceName: "wuppGebiet",
    layers: [
      {
        name: "R102:fluruebersicht",
        icon: "gebiet/Flur-_u_Gemarkungsübersicht",
      },
      {
        name: "kst_landtagswahlkreise",
        keywords: [":vec:"],
        icon: "gebiet/Landtagswahlkreise",
      },
      {
        name: "kst_knoten",
        keywords: [":vec:"],
        icon: "gebiet/Knoten",
      },
      {
        name: "kst_segment",
        keywords: [":vec:"],
        icon: "gebiet/Segmente",
      },
      {
        name: "kst_segmenttypen",
        keywords: [":vec:"],
        icon: "gebiet/Segmenttypen",
      },
      {
        name: "kst_segment_hnr",
        keywords: [":vec:"],
        icon: "gebiet/Segmente_m_Hausnummer",
      },
      {
        name: "kst_segment_steigung",
        keywords: [":vec:"],
        icon: "gebiet/Segmente_m_Steigung",
      },
      {
        name: "kst_baubloecke",
        keywords: [":vec:"],
        icon: "gebiet/Baublöcke",
      },
      {
        name: "kst_quartiere",
        keywords: [":vec:"],
        icon: "gebiet/Quartiere",
      },
      {
        name: "kst_stadtbezirk",
        keywords: [":vec:"],
        icon: "gebiet/Stadtbezirk",
      },
      {
        name: "kst_stadtgebiet",
        keywords: [":vec:"],
        icon: "gebiet/Stadtgebiet",
      },
      {
        name: "kst_statistische_bezirke",
        keywords: [":vec:"],
        icon: "gebiet/Statistische_Bezirke",
      },
      {
        name: "kst_stimmbezirke",
        keywords: [":vec:"],
        icon: "gebiet/Stimmbezirke",
      },
      {
        name: "kst_kommunalwahlbezirke",
        keywords: [":vec:"],
        icon: "gebiet/Kommunalwahlbezirke",
      },
      {
        name: "kst_bundestagswahlkreise",
        keywords: [":vec:"],
        icon: "gebiet/Bundestagswahlkreise",
      },
      {
        name: "gitter_kreuze",
        icon: "gebiet/Gitterkreuze_ETRS89_50x50m",
      },
      {
        name: "gitter_gk_500",
        icon: "gebiet/Gitter_GK2_500x250m",
      },
      {
        name: "gitter_500",
        icon: "gebiet/Gitter_ETRS89_500x250m",
      },
      {
        name: "gitter_gk_1000",
        icon: "gebiet/Gitter_GK2_1x1km",
      },
      {
        name: "gitter_1000",
        icon: "gebiet/Gitter_ETRS89_1x1km",
      },
      {
        name: "gitter_bezirke",
        icon: "gebiet/Nummerierungsbezirke_ETRS89_1x1km",
      },
      {
        name: "gitter_gk_2000",
        icon: "gebiet/Gitter_GK2_2x2km",
      },
      {
        name: "gitter_2000",
        icon: "gebiet/Gitter_ETRS89_2x2km",
      },
      {
        name: "hoehenu",
        icon: "gebiet/1m-Höhenlinien",
      },
      {
        name: "hoehenv",
        icon: "gebiet/1m-Höhenlinien",
      },
    ],
  },
  karten: {
    Title: "Basis",
    serviceName: "wuppKarten",
    layers: [
      {
        name: "alf",
        icon: "basis/Flurkarte_farbig_ABK",
      },
      {
        name: "algw",
        icon: "basis/Flurkarte_Graustufen_ABK",
      },
      {
        name: "alkomf",
        icon: "basis/Stadtgrundkarte_farbig_ABK",
      },
      {
        name: "alkomgw",
        icon: "basis/Stadtgrundkarte_Graustufen_ABK",
      },
      {
        name: "albsf",
        icon: "basis/Schätzungskarte_farbig_ABK",
      },
      {
        name: "albsgw",
        icon: "basis/Schätzungskarte_Graustufen_ABK",
      },
      {
        name: "expsw",
        pictureBoundingBox: [
          784874.5156892611, 6655868.893474152, 821182.1041247197,
          6679927.448126909,
        ],
        icon: "basis/Expresskarte_Strichkarte_schwarz",
      },
      {
        name: "expg",
        pictureBoundingBox: [
          784874.5156892611, 6655868.893474152, 821182.1041247197,
          6679927.448126909,
        ],
        icon: "basis/Expresskarte_Strichkarte_gelb",
      },
      {
        name: "abkf",
        icon: "basis/Amtliche_Basiskarte_farbig",
      },
      {
        name: "abkg",
        icon: "basis/Amtliche_Basiskarte_Graustufen_ABK",
      },
      {
        name: "abkt",
        icon: "basis/Amtliche_Basiskarte_Graustufen_transparent",
      },
      {
        name: "spw2_orange",
        icon: "basis/SPW_Orange",
      },
      {
        name: "spw2_light",
        icon: "basis/SPW_Light",
      },
      {
        name: "spw2_graublau",
        icon: "basis/SPW_Graublau",
      },
      {
        name: "oepnv_rvr",
        icon: "basis/SPW_Light_OEPNV",
      },
      {
        name: "hillshade",
        icon: "basis/Reliefschummerung",
      },
      {
        name: "R102:UEK125",
        pictureBoundingBox: [
          784874.5156892611, 6655868.893474152, 821182.1041247197,
          6679927.448126909,
        ],
        icon: "basis/Übersichtskarte_RS-SG-W",
      },
      {
        name: "R102:STADTRSW",
        icon: "basis/Stadtplan_RS-SG-W",
      },
      {
        name: "R102:stadtgrundkarte_hausnr",
        keywords: [":vec:"],
        icon: "basis/Stadtgrundkarte_Hausnummern",
      },
      {
        name: "urban",
        keywords: [":vec:"],
        icon: "basis/Urban_Atlas",
      },
      {
        name: "wuppertal:1827",
        pictureBoundingBox: [
          784874.5156892611, 6655868.893474152, 821182.1041247197,
          6679927.448126909,
        ],
        icon: "basis/W-1827",
      },
      {
        name: "wuppertal:1929",
        pictureBoundingBox: [
          784874.5156892611, 6655868.893474152, 821182.1041247197,
          6679927.448126909,
        ],
        icon: "basis/W-1929",
      },
      {
        name: "wuppertal:1979",
        pictureBoundingBox: [
          784874.5156892611, 6655868.893474152, 821182.1041247197,
          6679927.448126909,
        ],
        icon: "basis/W-1979",
      },
      {
        name: "wuppertal:2004",
        pictureBoundingBox: [
          784874.5156892611, 6655868.893474152, 821182.1041247197,
          6679927.448126909,
        ],
        icon: "basis/W-2004",
      },
      {
        name: "R102:DGK:schwarz",
        icon: "basis/DKG_Grundriss_Schwarz-Weiss_transparent_12-2013",
      },
      {
        name: "R102:DGK:gelb",
        icon: "basis/DKG_Grundriss_Gelb-Weiss_transparent_12-2013",
      },
      {
        name: "R102:DGK:grau",
        icon: "basis/DKG_Grundriss_Graustufen_transparent_12-2013",
      },
      {
        name: "R102:DGK:grau_nt",
        icon: "basis/DKG_Grundriss_Graustufen_12-2013",
      },
      {
        name: "bplanreihe",
        icon: "basis/BPlanreihe",
      },
      {
        name: "bplanhintergrund",
        keywords: [":vec:", `carmaConf://minZoom:9`],
        icon: "basis/BPlanhintergrund",
      },
      {
        name: "R102:trueortho2024",
        icon: "basis/Tru_Orthofoto_2018-2022",
      },
      {
        name: "R102:trueortho2022",
        icon: "basis/Tru_Orthofoto_2018-2022",
      },
      {
        name: "R102:trueortho2020",
        icon: "basis/Tru_Orthofoto_2018-2022",
      },
      {
        name: "R102:trueortho2018",
        icon: "basis/Tru_Orthofoto_2018-2022",
      },
      {
        name: "R102:luftbild2024",
        icon: "basis/Orthofoto_2002-2022",
      },
      {
        name: "R102:luftbild2022",
        icon: "basis/Orthofoto_2002-2022",
      },
      {
        name: "R102:luftbild2020",
        icon: "basis/Orthofoto_2002-2022",
      },
      {
        name: "R102:luftbild2018",
        icon: "basis/Orthofoto_2002-2022",
      },
      {
        name: "R102:luftbild2016",
        icon: "basis/Orthofoto_2002-2022",
      },
      {
        name: "R102:luftbild2014",
        icon: "basis/Orthofoto_2002-2022",
      },
      {
        name: "R102:luftbild2012",
        icon: "basis/Orthofoto_2002-2022",
      },
      {
        name: "R102:luftbild2010",
        icon: "basis/Orthofoto_2002-2022",
      },
      {
        name: "R102:luftbild2007",
        icon: "basis/Orthofoto_2002-2022",
      },
      {
        name: "R102:luftbild2005",
        icon: "basis/Orthofoto_2002-2022",
      },
      {
        name: "R102:luftbild2002",
        icon: "basis/Orthofoto_2002-2022",
      },
      {
        name: "R102:luftbild1997",
        icon: "basis/Orthofoto_1986-1997",
      },
      {
        name: "R102:luftbild1991",
        icon: "basis/Orthofoto_1986-1997",
      },
      {
        name: "R102:luftbild1985",
        icon: "basis/Orthofoto_1986-1997",
      },
      {
        name: "R102:luftbild1979",
        icon: "basis/Orthofoto_1979",
      },
      {
        name: "R102:luftbild1928",
        icon: "basis/Orthofoto_1928",
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
