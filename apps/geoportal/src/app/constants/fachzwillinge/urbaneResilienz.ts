import { fachzwillingBranding } from "@carma-collab/wuppertal/fachzwilling";

import type { FachzwillingRoute } from ".";

const resilienzItemIds = [
  "wuppUmwelt:uschwemm_ermittelt",
  "wuppUmwelt:uschwemm_vor",
  "wuppUmwelt:uschwemm_fest",
  "wuppUmwelt:gefahr_niedrig",
  "wuppUmwelt:gefahr_mittel",
  "wuppUmwelt:gefahr_hoch",
  "wuppUmwelt:R102_50md",
  "wuppUmwelt:R102_50d",
  "wuppUmwelt:R102_50v",
  "wuppUmwelt:R102_100md",
  "wuppUmwelt:R102_100d",
  "wuppUmwelt:R102_100v",
  "wuppUmwelt:R102_90md",
  "wuppUmwelt:R102_90d",
  "wuppUmwelt:R102_90v",
  "wuppUmwelt:R102_SRmd",
  "wuppUmwelt:R102_SRd",
  "wuppUmwelt:R102_SRv",
  "wuppUmwelt:hitzeinseln_ist",
  "wuppUmwelt:Hitze-Stark-Ist",
  "wuppUmwelt:Hitze-2050",
  "wuppUmwelt:boden_radon",
  "wuppPOI:poi_feuerwehr",
  "wuppPOI:poi_polizeidienststellen",
  "wuppPOI:poi_krankenhaeuser",
  "wuppPOI:poi_stauseen",
  "wuppTopicMaps_flooding",
  "wuppTopicMaps_rainhazard",
  "wuppTopicMaps_hitze",
];

export const urbaneResilienzFachzwilling: FachzwillingRoute = {
  path: "urbane-resilienz",
  ...fachzwillingBranding.urbaneResilienz,
  siteTitle: "DZ Urbane Resilienz",
  description:
    "Beschreibung: Der Fachzwilling Urbane Resilienz bündelt die " +
    "Karteninhalte des Geoportals zu Hochwasser, Starkregen, Hitze und den " +
    "Standorten der Gefahrenabwehr und Versorgung.",
  availability: {
    deployments: ["localDev", "dev", "pr"],
  },
  filters: [{ field: "id", values: resilienzItemIds }],
};
