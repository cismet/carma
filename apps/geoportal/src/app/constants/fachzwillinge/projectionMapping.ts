import type { FachzwillingRoute } from ".";

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
  /**
   * The "Workflows" category of this route: one card per set of layers that is
   * meant to be shown as one step of the show. A perspective without cards is
   * dropped before the catalog is built, so the placeholder below is what keeps
   * the category on screen until the real sets are declared.
   */
  perspectives: [
    {
      id: "projection-mapping",
      title: "Projection Mapping",
      workflows: [
        {
          /**
           * Placeholder, carries no `layers` on purpose: nothing is added to
           * the map when it is clicked. Replace it with the real steps of the
           * show, each with its own `layers` and, where the step is meant to
           * show only its own layers, `tools: ["layerVisibility"]`.
           */
          id: "platzhalter",
          title: "Platzhalter",
          description:
            "Noch ohne Inhalt. Hier stehen später die Layer-Sets der " +
            "Projection-Mapping-Demo, ein Eintrag je Schritt der Show.",
        },
      ],
    },
  ],
};
