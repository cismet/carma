import { faMap } from "@fortawesome/free-solid-svg-icons";

import {
  createConfig,
  DEFAULT_HOST,
  DEFAULT_PROJ,
  ENDPOINT,
} from "@carma-commons/resources";

import type { FachzwillingRoute } from ".";

export const bodenFachzwilling: FachzwillingRoute = {
  path: "boden",
  title: "Grund und Boden",
  description: "Boden Fachzwilling",
  ui: { allow3d: false },
  availability: {
    deployments: ["localDev", "dev", "pr"],
  },
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
      kind: "gazetteerMode",
      config: {
        key: "bplaene",
        label: "Bebauungspläne",
        icon: faMap,
        iconSize: 14,
        placeholder: "B-Plan suchen",
        showAllOnFocus: true,
        sources: [
          createConfig(ENDPOINT.BPLAENE, {
            crs: DEFAULT_PROJ,
            host: DEFAULT_HOST,
          }),
        ],
      },
    },
    { kind: "vectorHighlight", config: { modifierClick: "alt", lasso: true } },
    {
      kind: "visibleFeatureStatsSource",
      config: {
        showDebugBounds: true,
        debugInsetPx: { top: 56, left: 1, right: 0, bottom: 4 },
      },
    },
    { kind: "visibleFeatureStatsPanel", config: {} },
  ],
};
