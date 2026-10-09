import type { ActiveRoute } from "./routeChannel";

/**
 * The navigation in `sessionStorage`, so a reload (the phone's browser
 * dropping the tab, a tap on the wrong link) does not lose it.
 *
 * `sessionStorage` rather than `localStorage`: it belongs to this tab, and a
 * navigation is not something to find waiting in a new one days later. What
 * is kept is the route being driven (the latest reroute, not the route that
 * was in focus) and when the navigation started; written on the start and on
 * every reroute, cleared when the navigation ends.
 */
const KEY = "carma.routing.navigation";

export type SavedNavigation = {
  route: ActiveRoute;
  /** when the navigation started, ms since the epoch */
  startedAt: number;
};

export const saveNavigation = (saved: SavedNavigation) => {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(saved));
  } catch {
    // full or blocked storage: no resume after a reload, nothing worse
  }
};

export const clearSavedNavigation = () => {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // nothing to clear
  }
};

/**
 * The saved navigation, when there is one younger than `maxAgeMs`; an older
 * one is cleared, since the user is long past wherever it was.
 */
export const loadNavigation = (maxAgeMs: number): SavedNavigation | null => {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) {
      return null;
    }
    const saved = JSON.parse(raw) as SavedNavigation;
    const fresh =
      typeof saved?.startedAt === "number" &&
      Date.now() - saved.startedAt < maxAgeMs &&
      Array.isArray(saved.route?.coordinates) &&
      saved.route.coordinates.length > 1;
    if (!fresh) {
      clearSavedNavigation();
      return null;
    }
    return saved;
  } catch {
    return null;
  }
};
