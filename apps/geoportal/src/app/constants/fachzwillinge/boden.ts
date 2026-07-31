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
    // alt+click a vector feature -> it stays lit, everything else dims.
    // alt+drag lassos: everything the stroke covers is toggled the same way.
    // the control column gets a lasso button that starts the same mode without
    // the modifier; while it is on the same button is a cross that ends it.
    // Only effective on the MapLibre map (featureFlagLibreMap, alias `ng`).
    { kind: "vectorHighlight", config: { modifierClick: "alt", lasso: true } },
    // logs the features inside the visible viewport on every settled pan/zoom.
    // showDebugBounds draws the queried rectangle (yellow border) so the
    // measured area can be checked against what is actually on screen.
    // the map container starts at y=0 behind the top navbar, so the box needs a
    // larger top inset than the other sides to be visible at all.
    // while the highlight mode above runs, it counts only the highlighted
    // features (filterByHighlight, on by default)
    {
      kind: "visibleFeatureStatsSource",
      config: {
        showDebugBounds: true,
        debugInsetPx: { top: 56, left: 1, right: 0, bottom: 4 },
      },
    },
    // draws what the source publishes. Drop this entry to keep the console log
    // alone; drop the source and the panel stays empty (and says so in the dev
    // console, off the requires/provides declarations in the registry).
    { kind: "visibleFeatureStatsPanel", config: {} },
  ],
};
