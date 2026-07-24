import {
  createConfig,
  DEFAULT_HOST,
  DEFAULT_PROJ,
  ENDPOINT,
} from "@carma-commons/resources";

import type { FachzwillingRoute } from "./fachzwillinge";

export const bodenFachzwilling: FachzwillingRoute = {
  path: "boden",
  title: "Grund und Boden",
  description: "Boden Fachzwilling",
  ui: { allow3d: false },
  thumbnail:
    "https://tiles.cismet.de/alkis/assets/alkis_flurstuecke_str_hnr_schwarz.png",
  filters: [
    {
      field: "keywords",
      values: ["Gebäude", "Flurstück", "Bauwerk"],
    },
  ],
  addons: [
    {
      kind: "gazetteerSource",
      source: createConfig(ENDPOINT.BPLAENE, {
        crs: DEFAULT_PROJ,
        host: DEFAULT_HOST,
      }),
    },
  ],
};
