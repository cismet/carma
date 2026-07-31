import type { FachzwillingRoute } from ".";

export const outletFachzwilling: FachzwillingRoute = {
  path: "outlet",
  hideFromCatalog: true,
  ui: { hideAll: true },
  disableMapInteraction: true,
  // the addon owns the view; hash writes would only push history entries and
  // seed the next reload with a view that then has to be fitted away again
  disableHashWrite: true,
  // every expired-tile refresh repaints through the raster fade, which the
  // projector shows as a flicker
  disableExpiredTileRefresh: true,
  // the app-wide "config" key is stripped after loading and dropped from share
  // links, so the source window carries its own key that nothing else touches
  configHashKey: "usedConfig",
  availability: {
    deployments: ["localDev", "dev", "pr"],
  },
  addons: [
    {
      kind: "outlet",
      config: {
        // georef.bounds of the printed Wuppertal model, from carmaPM
        // models/wupp/twin-wupp.json (surveyed 2026-07-25). Overridable per
        // launch with ?bounds=minX,minY,maxX,maxY.
        bounds3857: [
          799889.651999282, 6669297.559285149, 802976.986756942,
          6671027.711313527,
        ],
      },
    },
  ],
};
