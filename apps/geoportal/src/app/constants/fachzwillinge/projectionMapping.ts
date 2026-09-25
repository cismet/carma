import {
  schwebebahn2dWorkflowsWithoutStations,
  starkregenFlowWorkflows,
} from "./workflows";

import type { FachzwillingRoute } from ".";

/** where the pipeline publishes the styles built for the printed model */
const PROJECTION_MAPPING_STYLES = "https://tiles.cismet.de/projection_mapping";

/**
 * The outline of the projection area ("Projektionsbereich"). It darkens
 * everything outside the area the projector covers, which helps while the
 * show is put together and has nothing to do on the model itself.
 */
const PROJECTION_AREA_STYLE = `${PROJECTION_MAPPING_STYLES}/umriss.style.json`;

/**
 * Zoom gate of the flow field cards. The projection area is about 3.6 by 2 km,
 * which a projector 1920 pixels wide shows at zoom 14.7; the cards' own gate of
 * 16 would keep the animation still on the whole model.
 */
const MODEL_FLOW_MIN_ZOOM = 14;

/**
 * The remote the published show opens on the phone (`apps/pm-remote`). The
 * local dev server has its own port; a deployment may name another host.
 */
const PM_REMOTE_URL =
  import.meta.env.VITE_PM_REMOTE_URL ||
  (import.meta.env.DEV
    ? "http://localhost:4210/"
    : "https://carma-dev-deployments.github.io/pm-remote/");

/**
 * Where "Veröffentlichen" stores the show. Unset, the addon's default ceepr
 * folder; a local test points it at a ceepr on this machine.
 */
const SHOW_STORE_URL: string | undefined =
  import.meta.env.VITE_SHOW_STORE_URL || undefined;
/** where "Show öffnen" reads a show; set it together with the store url */
const SHOW_READ_URL: string | undefined =
  import.meta.env.VITE_SHOW_READ_URL || undefined;

/**
 * The collection point for the projection mapping show: the layers that are
 * meant to end up on the printed Wuppertal model are picked and kept here,
 * separate from the plain geoportal.
 *
 * Not the projection window itself, that is `#/outlet`, which renders whatever
 * the relay pushes into it. This route is the curating side, so it keeps the
 * full geoportal ui and the unfiltered catalog: any layer of the catalog may
 * end up in the show. What is added here persists in this route's own storage
 * namespace ("pm-show", from its path), so a session of collecting does not
 * write itself into the geoportal a bookmark reopens days later.
 *
 * `hideFromCatalog` keeps it out of the "Fachzwillinge" cards, the same as the
 * "workflows" and "addons" routes: reachable by its url, not advertised.
 */
export const projectionMappingFachzwilling: FachzwillingRoute = {
  path: "pm-show",
  hideFromCatalog: true,
  title: "Projection Mapping Demo",
  // the show is projected onto a flat printed model, so 3d has nothing to add
  ui: { allow3d: false },
  availability: {
    deployments: ["localDev", "dev", "pr"],
  },
  addons: [
    // the engine the Schwebebahn cards launch into; idle until one is clicked
    "vehicleAnimation",
    // the same for the Starkregen cards. Its own storage key, so tuning it for
    // the model does not reach the flow field of the other routes.
    {
      addon: "flowField",
      config: { storageKey: "carma::flowFieldState::pm-show" },
    },
    // "save as scene" and "publish" for the remote on the phone
    {
      addon: "showScenes",
      config: {
        remoteUrl: PM_REMOTE_URL,
        ...(SHOW_STORE_URL ? { storeUrl: SHOW_STORE_URL } : {}),
        ...(SHOW_READ_URL ? { readUrl: SHOW_READ_URL } : {}),
        // pre-ticked in the panel's "Nicht in der Show" list
        excludeLayers: [PROJECTION_AREA_STYLE],
      },
    },
  ],
  /**
   * The layers of the show, grouped as it walks through them. Most are built
   * for the printed model and are not in the catalog the services deliver; the
   * entries given as an id (the undivided true orthofoto, the two thematic
   * maps) are the delivered layers, lifted into the group they belong to
   * here.
   */
  additionalLayers: [
    {
      Title: "Projection Mapping",
      layers: [
        {
          styleUrl: PROJECTION_AREA_STYLE,
          // everything outside the projection area is darkened by this layer,
          // so it has to stay above whatever is added after it
          tools: ["alwaysOnTop"],
        },
        `${PROJECTION_MAPPING_STYLES}/wupper.style.json`,
      ],
    },
    {
      Title: "Orthofotos",
      layers: [
        "wuppKarten:R102:trueortho2024",
        `${PROJECTION_MAPPING_STYLES}/trueortho_daecher.style.json`,
        `${PROJECTION_MAPPING_STYLES}/trueortho_strassen.style.json`,
      ],
    },
    {
      Title: "Themen",
      layers: [
        "wuppPlanung:r102_fnp_haupt_fl",
        "wuppUmwelt:Klimafunktion",
        "https://tiles.cismet.de/pm_naturdenkmale/style.json",
        "https://tiles.cismet.de/pm_poi/style.json",
        "https://tiles.cismet.de/pm_belis_leuchten/style.json",
      ],
    },
    {
      Title: "Starkregen",
      // each style launches its time series itself, see its carmaConf.tools;
      // the `_autostart` copy plays as soon as it is on the map, the plain one
      // waits for the remote or the play button
      layers: [
        `${PROJECTION_MAPPING_STYLES}/starkregen_t50_zeitreihe.style.json`,
        `${PROJECTION_MAPPING_STYLES}/starkregen_t50_zeitreihe_autostart.style.json`,
        `${PROJECTION_MAPPING_STYLES}/starkregen_t100_zeitreihe.style.json`,
        `${PROJECTION_MAPPING_STYLES}/starkregen_t100_zeitreihe_autostart.style.json`,
        `${PROJECTION_MAPPING_STYLES}/starkregen_90mm_zeitreihe.style.json`,
        `${PROJECTION_MAPPING_STYLES}/starkregen_90mm_zeitreihe_autostart.style.json`,
        `${PROJECTION_MAPPING_STYLES}/starkregen_extrem2018_zeitreihe.style.json`,
        `${PROJECTION_MAPPING_STYLES}/starkregen_extrem2018_zeitreihe_autostart.style.json`,
      ],
    },
    {
      Title: "Hochwasser",
      // one scenario of the Hochwassergefahrenkarte each; no time steps
      layers: [
        `${PROJECTION_MAPPING_STYLES}/hochwasser_hq_haeufig.style.json`,
        `${PROJECTION_MAPPING_STYLES}/hochwasser_hq100.style.json`,
        `${PROJECTION_MAPPING_STYLES}/hochwasser_hq_extrem.style.json`,
      ],
    },
    {
      Title: "Bäume",
      layers: [
        "https://tiles.cismet.de/pm_trees/modell.style.json",
        "https://tiles.cismet.de/pm_trees/mask.style.json",
      ],
    },
    {
      Title: "RVR",
      layers: [
        `${PROJECTION_MAPPING_STYLES}/grundriss_light.style.json`,
        `${PROJECTION_MAPPING_STYLES}/grundriss_graublau.style.json`,
        `${PROJECTION_MAPPING_STYLES}/grundriss_extralight.style.json`,
      ],
    },
    {
      Title: "Dark",
      layers: [
        `${PROJECTION_MAPPING_STYLES}/trueortho_dunkel.style.json`,
        `${PROJECTION_MAPPING_STYLES}/grundriss_extralight_dunkel.style.json`,
        `${PROJECTION_MAPPING_STYLES}/grundriss_light_dunkel.style.json`,
        `${PROJECTION_MAPPING_STYLES}/grundriss_graublau_dunkel.style.json`,
      ],
    },
    {
      Title: "Tools",
      // plain colour backgrounds: blank the model between steps or give a
      // layer a neutral ground
      layers: [
        "https://tiles.cismet.de/colors/black.style.json",
        "https://tiles.cismet.de/colors/white.style.json",
      ],
    },
  ],
  /**
   * The "Workflows" category of this route: one card per set of layers that is
   * meant to be shown as one step of the show.
   */
  perspectives: [
    {
      id: "mobilitaet",
      title: "Mobilität",
      // the workflows route's cards without the two 3d ones, which this route
      // has no mode for, and without the station markers, which would be
      // projected onto the model
      workflows: schwebebahn2dWorkflowsWithoutStations,
    },
    {
      id: "starkregen",
      title: "Starkregen",
      // the workflows route's Fließwege cards, animated from the model's zoom
      workflows: starkregenFlowWorkflows(MODEL_FLOW_MIN_ZOOM),
    },
  ],
};
