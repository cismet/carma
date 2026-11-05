import { fachzwillingBranding } from "@carma-collab/wuppertal/fachzwilling";

import type { FachzwillingRoute } from ".";

const klimaItemIds = [
  "wuppUmwelt:Klimafunktion",
  "wuppUmwelt:Planhinweise",
  "wuppUmwelt:hitzeinseln_ist",
  "wuppUmwelt:Hitze-Stark-Ist",
  "wuppUmwelt:Hitze-2050",
  "wuppUmwelt:Frischluftschneisen",
  "wuppUmwelt:Freiflaechen",
  "wuppUmwelt:bodenfunktion_klima",
  "wuppUmwelt:bodenfunktion_wasserhaushalt",
  "wuppUmwelt:baumbewaesserung",
  "wuppUmwelt:R102_50md",
  "wuppUmwelt:R102_100md",
  "wuppUmwelt:R102_90md",
  "wuppUmwelt:R102_SRmd",
  "wuppUmwelt:solar_year",
  "wuppPOI:poi_trinkwasser",
  "wuppTopicMaps_hitze",
  "wuppTopicMaps_klimaorte",
  "wuppTopicMaps_rainhazard",
  "wuppTopicMaps_trinkwasserbrunnen",
];

export const klimawandelUndAnpassungFachzwilling: FachzwillingRoute = {
  path: "klimawandel-und-anpassung",
  ...fachzwillingBranding.klimawandelUndAnpassung,
  siteTitle: "DZ Klimawandel",
  description:
    "Beschreibung: Der Fachzwilling Klimawandel und Anpassung bündelt die " +
    "Karteninhalte des Geoportals zu Stadtklima, Hitze, Starkregen und " +
    "klimarelevanten Flächen.",
  availability: {
    deployments: ["localDev", "dev", "pr"],
  },
  filters: [{ field: "id", values: klimaItemIds }],
};
