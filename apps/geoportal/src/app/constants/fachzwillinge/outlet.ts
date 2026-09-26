import type { FachzwillingRoute } from ".";

/**
 * The relay the source window takes its remote commands from. Deployments set
 * it in `deployment-config.json`; the local dev server sets nothing, so it
 * falls back to a relay on the developer's own machine, which is what
 * `npx nx run map-relay:serve` starts.
 */
const RELAY_BASE_URL =
  import.meta.env.VITE_RELAY_BASE_URL || "http://localhost:8099";

export const outletFachzwilling: FachzwillingRoute = {
  path: "outlet",
  hideFromCatalog: true,
  // its layers are whatever the remote last pushed, so they must not land in
  // the storage the plain geoportal rehydrates from
  appKey: "outlet",
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
  // a config switched to once, at the latest in the rehearsal, is there again
  // at the venue without a call to the config service
  cacheConfigsById: true,
  availability: {
    deployments: ["localDev", "dev", "pr"],
  },
  addons: [
    {
      addon: "outlet",
      config: {
        // georef.bounds of the printed zoo model the projector plays on, from
        // cage apps/pm-tools/zoo-kubitur/twin-zoo-kubitur-2m.json (the same as
        // the board bounds in assets/dz-b-prm/collection.json). Overridable
        // per launch with ?bounds=minX,minY,maxX,maxY.
        bounds3857: [788836.855, 6663227.421, 794575.246, 6666423.835],
        // remote control is off until a session code is passed as ?relay=
        relayBaseUrl: RELAY_BASE_URL,
      },
    },
  ],
};
