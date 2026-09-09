import { schwebebahn2dWorkflowsWithoutStations } from "./workflows";

import type { FachzwillingRoute } from ".";

/** where the pipeline publishes the styles built for the printed model */
const PROJECTION_MAPPING_STYLES =
  "https://tiles.cismet.de/projection_mapping";

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
  // the engine the Schwebebahn cards launch into; idle until one is clicked
  addons: ["vehicleAnimation"],
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
          styleUrl: `${PROJECTION_MAPPING_STYLES}/umriss.style.json`,
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
      Title: "Bäume",
      layers: [
        "https://tiles.cismet.de/pm_trees/style.json",
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
  ],
};
