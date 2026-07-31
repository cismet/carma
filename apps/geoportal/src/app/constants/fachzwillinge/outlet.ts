import type { FachzwillingRoute } from ".";

export const outletFachzwilling: FachzwillingRoute = {
  path: "outlet",
  hideFromCatalog: true,
  ui: { hideAll: true },
  disableMapInteraction: true,
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
