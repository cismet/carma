import { faMap } from "@fortawesome/free-solid-svg-icons";

import {
  createConfig,
  DEFAULT_HOST,
  DEFAULT_PROJ,
  ENDPOINT,
} from "@carma-commons/resources";

// temporary demo images for the infoBoxZoomImage experiment,
// tower-01 is the closest view, tower-06 the widest
import tower01 from "../../../assets/temp-demo/tower-01.png";
import tower02 from "../../../assets/temp-demo/tower-02.png";
import tower03 from "../../../assets/temp-demo/tower-03.png";
import tower04 from "../../../assets/temp-demo/tower-04.png";
import tower06 from "../../../assets/temp-demo/tower-06.png";

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
      /**
       * Arrow-key navigation, global shape: every navigable layer on the map,
       * toggled from the control column. The identical config object is
       * declared on a workflow's `tools` in the Gesundheit Fachzwilling, where
       * the same addon is scoped to that workflow's layer group instead —
       * nothing but the place of declaration differs.
       */
      kind: "featureKeyboardNav",
      config: {
        sharpness: 0.5,
        crossLayer: "prefer-current",
        explain: "brief",
      },
    },
    {
      kind: "visibleFeatureStatsSource",
      config: {
        showDebugBounds: true,
        insetPx: { top: 56, left: 1, right: 0, bottom: 4 },
      },
    },
    { kind: "visibleFeatureStatsPanel", config: {} },
    // {
    //   /**
    //    * experiment: the image in the info box changes with the zoom.
    //    *
    //    * One entry per layer, each with its own zoom steps — the steps of one
    //    * layer say nothing about the other. Within a layer the first step whose
    //    * range contains the current zoom wins; when no step matches, the feature
    //    * shows its own photo again.
    //    *
    //    * A key is the layer name from the catalog config, or the full
    //    * "<serviceName>:<layerName>" id when the name is ambiguous.
    //    */
    //   kind: "infoBoxZoomImage",
    //   config: {
    //     rules: {
    //       // one image per zoom step, from the widest view to the closest;
    //       // the last step has no upper bound, so it covers every deeper zoom
    //       poi_gebaeude: [
    //         // { maxZoom: 12, imageUrl: tower06 },
    //         { maxZoom: 14, imageUrl: tower06 },
    //         { maxZoom: 16, imageUrl: tower04 },
    //         { maxZoom: 18, imageUrl: tower03 },
    //         { maxZoom: 20, imageUrl: tower02 },
    //         { imageUrl: tower01 },
    //       ],
    //     },
    //     // demo only: features that carry no photo also get the test image
    //     showOnFeaturesWithoutPhoto: true,
    //   },
    // },
  ],
};
