import type { FachzwillingRoute } from ".";
import { DEFAULT_HOME_VIEW_REF } from "../../config/view.config";

export const addonsFachzwilling: FachzwillingRoute = {
  path: "addons",
  hideFromCatalog: true,
  title: "Addons",
  availability: {
    deployments: ["localDev", "dev", "pr"],
  },
  addons: [
    { kind: "addonManager", config: { showControl: true } },
    // Compares the layers already on the map by splitting the window between
    // two panels. The button switches the mode; which layer goes to which side
    // is not selectable yet, the topmost two go one each and whatever is below
    // them stays under both.
    { kind: "comparingControl" },
    { kind: "compareSwipe", config: {} },
    // the same comparison as separate windows: up to four real maps in a
    // layout, one per assigned set of layers, all on one camera.
    // `ignoreToolbar: false` keeps the top row clear of the navbar instead of
    // running up behind it, at the price of every window resizing whenever the
    // chrome comes or goes. The layer buttons keep floating over the maps;
    // `#buttonWrapper` instead of `#topNavbar` would clear those as well.
    {
      kind: "compareArena",
      config: { toolbarSelector: "#topNavbar", ignoreToolbar: false },
    },
    // the same two panels as a lens: one map everywhere, the other inside a
    // circle that is dragged over it, and wheeled larger or smaller. Two panels
    // and no more, which the shared state holds the layout to.
    { kind: "compareSpyglass", config: {} },
    {
      kind: "vectorHighlight",
      config: {
        modifierClick: "alt",
        lasso: true,
        monochrome: false,
        clearDelay: 100,
        // the panel holds a step: applying 5 m twice selects at 10 m. false
        // makes it the whole width, so every apply re-buffers the drawn shape
        cumulativeBuffer: true,
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
    // sketch layer over the map; screen-fixed, the drawing does not follow the
    // camera. The control switches who gets the pointer.
    { kind: "excalidrawOverlay" },
    { kind: "excalidrawControl" },
    {
      kind: "libreTerrain",
      config: { appKey: "geoportal", show: "while3dLayersActive" },
    },
    // dev harness for highlightByIds; this route is localDev/dev/pr only
    {
      kind: "vectorHighlightDebug",
      config: { limit: 20, property: "id", hidden: true },
    },
    {
      kind: "nearestFeature",
      config: {
        origin: {
          lat: DEFAULT_HOME_VIEW_REF.lat,
          lng: DEFAULT_HOME_VIEW_REF.lng,
        },
      },
    },
    // the categories "In der Nähe" offers here; each can be switched off on its
    // own in the addon manager
    "nearestFeatureApotheken",
    "nearestFeatureBahnhoefe",
    "nearestFeatureKrankenhaeuser",
    // the "von wo?" input: appears once a category has been ranked, and any
    // address picked in it becomes the point "In der Nähe" measures from
    "originSearch",
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
