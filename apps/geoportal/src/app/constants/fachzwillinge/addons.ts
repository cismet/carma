import type { FachzwillingRoute } from ".";

export const addonsFachzwilling: FachzwillingRoute = {
  path: "addons",
  hideFromCatalog: true,
  title: "Addons",
  availability: {
    deployments: ["localDev", "dev", "pr"],
  },
  addons: [
    { kind: "addonManager", config: { showControl: true } },
    {
      kind: "vectorHighlight",
      config: {
        modifierClick: "alt",
        lasso: true,
        monochrome: false,
        // operationColors: {
        //   add: "#22c55e",
        //   subtract: "#ec4899",
        //   intersect: "#f97316",
        //   invert: "#3388ff",
        // },
        operationColors: {
          add: "#22c55e",
          subtract: "#ca61c3",
          intersect: "#f97316",
          invert: "#3388ff",
        },
      },
    },
    { kind: "vectorHighlightControl" },
    { kind: "libreTerrain", config: { appKey: "geoportal" } },
    // dev harness for highlightByIds; this route is localDev/dev/pr only
    {
      kind: "vectorHighlightDebug",
      config: { limit: 20, property: "id", hidden: true },
    },
    {
      kind: "visibleFeatureStatsSource",
      config: {
        showDebugBounds: true,
        insetPx: { top: 56, left: 1, right: 0, bottom: 4 },
      },
    },
    { kind: "visibleFeatureStatsPanel", config: {} },
    // caged: shows that cage is present, and renders nothing at all when the
    // cage submodule isre absent. Default is topright order 100, which puts it
    // under the stats panel (topright order 10).
    { kind: "cageIndicatorBadge" },
    // {
    //   /**
    //    * experiment: the image in the info box changes with the zoom.
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
