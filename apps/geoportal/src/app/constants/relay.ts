/**
 * The relay (`services/map-relay`) the routes following a show talk through:
 * the outlet and the plain geoportal with `?relay=<CODE>`. Deployments set it
 * in `deployment-config.json`; the local dev server sets nothing, so it falls
 * back to a relay on the developer's own machine, which is what
 * `npx nx run map-relay:serve` starts.
 */
export const RELAY_BASE_URL =
  import.meta.env.VITE_RELAY_BASE_URL || "http://localhost:8099";

/**
 * The printed zoo model the projector plays on, EPSG:3857: georef.bounds from
 * cage apps/pm-tools/zoo-kubitur/twin-zoo-kubitur-2m.json (the same as the
 * board bounds in assets/dz-b-prm/collection.json). The outlet lights it; the
 * geoportal following a show flies to it for every scene without a position
 * of its own.
 */
export const MODEL_BOUNDS_3857 = [
  788836.855, 6663227.421, 794575.246, 6666423.835,
] as const;
