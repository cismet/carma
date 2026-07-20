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
  description:
    "Beschreibung: Der Fachzwilling Gesundheit bündelt die Karteninhalte des Geoportals zu den Themen Gesundheitsversorgung, Umwelt- und Klimabelastung, Lärm sowie Sport und Erholung.",
  filters: [{ field: "id", values: gesundheitItemIds }],
  // Platzhalter-Perspektiven (per Konfigurator/Playground pflegbar); die
  // Workflows haben noch keine Funktion.
  perspectives: [
    {
      id: "versorgung",
      title: "Gesundheitsversorgung",
      workflows: [
        {
          id: "beispiel-workflow",
          title: "Beispiel-Workflow",
          description:
            "Platzhalter-Workflow. Titel, Beschreibung und Vorschaubild " +
            "werden über die Konfiguration gepflegt.",
        },
      ],
    },
  ],
};
