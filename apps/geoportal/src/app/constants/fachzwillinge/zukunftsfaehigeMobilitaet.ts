import { fachzwillingBranding } from "@carma-collab/wuppertal/fachzwilling";

import type { FachzwillingRoute } from ".";

const mobilitaetItemIds = [
  "wuppKarten:oepnv_rvr",
  "wuppPOI:poi_bahnhoefe",
  "wuppPOI:vrr_bus",
  "wuppPOI:poi_schwebebahnhaltestellen",
  "wuppVerkehr:strassenhierarchie",
  "wuppVerkehr:einstr",
  "wuppVerkehr:zone30",
  "wuppVerkehr:sch30",
  "wuppVerkehr:vbel2020",
  "wuppVerkehr:vbel2013",
  "wuppVerkehr:carsharing",
  "wuppVerkehr:kb_parken",
  "wuppVerkehr:bewohnerbereiche",
  "wuppVerkehr:bewohnerzonen",
  "wuppVerkehr:cityparkflaechen",
  "wuppVerkehr:cityzonen",
  "wuppVerkehr:pranlagen",
  "wuppVerkehr:branlagen",
  "wuppVerkehr:treppen",
  "wuppVerkehr:rad-ein",
  "wuppVerkehr:rad-bel",
  "wuppVerkehr:rad-stg",
  "wuppVerkehr:rad-ast",
  "wuppVerkehr:rad-sper",
  "wuppVerkehr:rad-zun",
  "wuppVerkehr:rad-bau",
  "wuppVerkehr:rad-wst",
  "wuppVerkehr:rad-w",
  "wuppVerkehr:rad-nrw",
  "wuppTopicMaps_xandride",
];

export const zukunftsfaehigeMobilitaetFachzwilling: FachzwillingRoute = {
  path: "zukunftsfaehige-mobilitaet",
  ...fachzwillingBranding.zukunftsfaehigeMobilitaet,
  description:
    "Beschreibung: Der Fachzwilling Zukunftsfähige Mobilität bündelt die " +
    "Karteninhalte des Geoportals zu öffentlichem Verkehr, Radverkehr, " +
    "Parken und Straßennetz.",
  availability: {
    deployments: ["localDev", "dev", "pr"],
  },
  filters: [{ field: "id", values: mobilitaetItemIds }],
};
