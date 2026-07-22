import type { FachzwillingRoute } from "./fachzwillinge";

const gesundheitItemIds = [
  "wuppPOI:poi_krankenhaeuser",
  "wuppInfra:apotheken",
  "wuppUmwelt:no2",
  "wuppUmwelt:umweltzonen",
  "wuppUmwelt:lugi2000",
  "wuppUmwelt:lugi1987",
  "wuppTopicMaps_luftMess",
  "wuppUmwelt:Klimafunktion",
  "wuppUmwelt:Planhinweise",
  "wuppUmwelt:hitzeinseln_ist",
  "wuppUmwelt:Hitze-2050",
  "wuppUmwelt:Frischluftschneisen",
  "wuppUmwelt:Freiflaechen",
  "wuppTopicMaps_hitze",
  "wuppTopicMaps_trinkwasserbrunnen",
  "wuppUmwelt:laerm2022:STR_RAST_DEN",
  "wuppUmwelt:laerm2022:STR_RAST_NGT",
  "wuppUmwelt:laerm2022:SCS_RAST_DEN",
  "wuppUmwelt:laerm2022:SCS_RAST_NGT",
  "wuppUmwelt:laerm:LDEN_BAHN_4",
  "wuppUmwelt:laerm:LNIGHT_BAHN_4",
  "wuppUmwelt:laerm2022:IND_RAST_DEN",
  "wuppUmwelt:laerm2022:IND_RAST_NGT",
  "wuppPOI:poi_schwimmbaeder",
  "wuppPOI:poi_sporthallen",
  "wuppPOI:poi_freizeitsportangebote",
  "wuppTopicMaps_baeder",
];

export const gesundheitFachzwilling: FachzwillingRoute = {
  path: "gesundheit",
  title: "Gesundheit",
  thumbnail:
    "https://geo.wuppertal.de/geoportal/geoportal_vorschau/poi_poi_krankenhaeuser.png",
  description:
    "Beschreibung: Der Fachzwilling Gesundheit bündelt die Karteninhalte des Geoportals zu den Themen Gesundheitsversorgung, Umwelt- und Klimabelastung, Lärm sowie Sport und Erholung.",
  filters: [{ field: "id", values: gesundheitItemIds }],
  perspectives: [
    {
      id: "versorgung",
      title: "Gesundheitsversorgung",
      workflows: [
        {
          id: "einrichtungen",
          title: "Gesundheitseinrichtungen",
          description:
            "Inhalt: Krankenhäuser und Apotheken im Wuppertaler Stadtgebiet, " +
            "zusammengefasst als eine Layer-Gruppe. " +
            "Sichtbarkeit: öffentlich. " +
            "Nutzung: Zur Übersicht über die Gesundheitsversorgung im " +
            "Stadtgebiet.",
          thumbnail:
            "https://geo.wuppertal.de/geoportal/geoportal_vorschau/infra_apotheken.png",
          layers: ["wuppPOI:poi_krankenhaeuser", "wuppInfra:apotheken"],
          tools: ["layerVisibility"],
          metaDataText:
            "Die Gruppe bündelt die Datensätze Krankenhäuser (wuppPOI) und " +
            "Apotheken (wuppInfra) aus dem Geoportal Wuppertal.",
        },
        {
          id: "freizeit",
          title: "Freizeitangebote",
          description:
            "Inhalt: Freizeitsportangebote, Sporthallen und Schwimmbäder, " +
            "zusammengefasst als eine Layer-Gruppe. " +
            "Sichtbarkeit: öffentlich. " +
            "Nutzung: Zur Übersicht über Sport- und Erholungsangebote im " +
            "Stadtgebiet.",
          layers: [
            "wuppPOI:poi_freizeitsportangebote",
            "wuppPOI:poi_sporthallen",
            "wuppPOI:poi_schwimmbaeder",
          ],
          tools: ["layerVisibility"],
        },
      ],
    },
  ],
};
