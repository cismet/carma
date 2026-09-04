import { allFachzwillingRoutes } from "../constants/fachzwillinge/routes";

/**
 * The storage namespace of a route: every Fachzwilling gets one of its own,
 * named after its path, and the plain geoportal keeps the app-wide one, which
 * is `undefined` here. A route's `appKey` overrides its path, see its doc.
 *
 * Isolation is the default because the alternative leaks: a Fachzwilling writes
 * its layer stack into the shared record and the plain geoportal reads it back
 * on the next cold visit, workflows included. Carrying a workflow from a
 * Fachzwilling into the geoportal is meant to be a deliberate step (#4055), not
 * something that happens to a bookmark days later.
 */
export const routeAppKeyForPath = (routePath: string): string | undefined => {
  const route = allFachzwillingRoutes.find(
    (candidate) => routePath === `/${candidate.path}`
  );
  return route ? route.appKey ?? route.path : undefined;
};

/**
 * The `?appKey=` currently in the hash, which pins one namespace for every
 * route instead of the per-route one.
 *
 * Parsed off the part behind the "?": URLSearchParams strips a leading "?" but
 * not a leading "#", so feeding it the whole hash makes the first parameter's
 * name come out as "#/outlet?appKey" and the lookup miss.
 */
const explicitAppKey = (): string | null =>
  new URLSearchParams(
    window.location.hash.split("?").slice(1).join("?")
  ).get("appKey");

/** the namespace this route's persisted state lives in, explicit key first */
export const resolveAppKey = (routePath: string): string | undefined =>
  explicitAppKey() ?? routeAppKeyForPath(routePath);

/** the route the app is starting on; the router is not mounted yet */
export const initialRoutePath = window.location.hash
  .replace(/^#/, "")
  .split("?")[0];

/**
 * The namespace the store was built with. redux-persist takes its storage keys
 * once, when the store is constructed, so this cannot follow a route change:
 * the hash router switches route without rebuilding the store, and the new
 * route would be served the previous one's records. `RoutedApp` compares
 * against this and turns such a switch into a real page load.
 */
export const STORE_APP_KEY = resolveAppKey(initialRoutePath);
