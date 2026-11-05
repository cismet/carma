import { fachzwillingBranding } from "@carma-collab/wuppertal/fachzwilling";

import type { FachzwillingRoute } from ".";

const stadtentwicklungItemIds = [
  "wuppPlanung:innenbandstadt",
  "wuppPlanung:talachse",
  "wuppPlanung:teilraeume",
  "wuppPlanung:srt_alle",
  "wuppPlanung:pf_brachflaechen",
  "wuppPlanung:pf_gewerbepotenzialflaechen",
  "wuppPlanung:pf_wohnbaupotenzialflaechen",
  "wuppPlanung:kwp_dezentral",
  "wuppPlanung:kwp_waermenetz",
  "wuppInfra:zvb",
  "wuppInfra:zvb-erw",
  "wuppInfra:fernwaermewsw",
  "wuppInfra:fernsued",
  "wuppInfra:fernsuedl",
  "wuppInfra:breitband_hk",
  "wuppUmwelt:solar_year",
  "wuppUmwelt:solar_zy_photo",
  "wuppUmwelt:solar_zy_therm",
  "wuppUmwelt:stadt:kompensationoe",
  "wuppImmo:wg_alle",
  "wuppImmo:nwg_alle",
  "wuppInfra:vk_online",
  "wuppTopicMaps_vorhaben",
  "wuppTopicMaps_klimaorte",
];

export const nachhaltigeStadtentwicklungFachzwilling: FachzwillingRoute = {
  path: "nachhaltige-stadtentwicklung",
  ...fachzwillingBranding.nachhaltigeStadtentwicklung,
  siteTitle: "DZ Stadtentwicklung",
  description:
    "Beschreibung: Der Fachzwilling Nachhaltige Stadtentwicklung bündelt die " +
    "Karteninhalte des Geoportals zu Stadtraum, Flächenpotenzialen, " +
    "Wärmeversorgung und erneuerbaren Energien.",
  availability: {
    deployments: ["localDev", "dev", "pr"],
  },
  filters: [{ field: "id", values: stadtentwicklungItemIds }],
};
