import { fachzwillingBranding } from "@carma-collab/wuppertal/fachzwilling";

import type { FachzwillingRoute } from ".";

const gruenItemIds = [
  "wuppPOI:poi_gruenanlagen",
  "wuppPOI:poi_ksp",
  "wuppPOI:poi_friedhoefe",
  "wuppPOI:poi_friedhoefe_ehem",
  "wuppPOI:poi_wupperufer",
  "wuppPlanung:gruen",
  "wuppPlanung:landschaft_lundsschutz",
  "wuppUmwelt:kga",
  "wuppUmwelt:naturdenkmale",
  "wuppUmwelt:stadt:kompensationoe",
  "wuppUmwelt:Freiflaechen",
  "wuppUmwelt:baeume",
  "wuppUmwelt:stadtbaumkonzept",
  "wuppUmwelt:baumbewaesserung",
  "wuppUmwelt:einzelbaum_stamm",
  "wuppUmwelt:einzelbaum_umringe",
  "wuppUmwelt:einzelbaum_stamm_2025",
  "wuppUmwelt:einzelbaum_umringe_2025",
  "wuppUmwelt:einzelbaum_baumarten",
  "wuppUmwelt:schaden_mit",
  "wuppUmwelt:ersatzbaum",
];

export const parksUndGruenanlagenFachzwilling: FachzwillingRoute = {
  path: "parks-und-gruenanlagen",
  ...fachzwillingBranding.parksUndGruenanlagen,
  siteTitle: "DZ Grünanlagen",
  description:
    "Beschreibung: Der Fachzwilling Parks und Grünanlagen bündelt die " +
    "Karteninhalte des Geoportals zu Grünflächen, Spielplätzen, " +
    "Stadtbäumen und Naturschutz.",
  availability: {
    deployments: ["localDev", "dev", "pr"],
  },
  filters: [{ field: "id", values: gruenItemIds }],
};
