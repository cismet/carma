// @carma-mapping/routing
// Route calculation, display, and UI components

export const ROUTING_VERSION = "0.0.1";

// Services
export {
  motisClient,
  planRoute,
  geocodeAddress,
  reverseGeocode,
  getStopsInArea,
  formatPlace,
  positionToMotisPlace,
  type MotisPlace,
  type MotisRouteParams,
} from "./services/motisService";

// Route display utilities
export {
  displayRouteOnMap,
  displaySelectedRouteOnMap,
  fetchRouteOptions,
  decodePolyline,
  type DisplayRouteOptions,
  type DisplaySelectedRouteOptions,
  type FetchRouteOptionsParams,
  type RouteOption,
} from "./utils/routeDisplay";

// Car route summary (travel time / driven distance, no geometry)
export {
  fetchCarRoute,
  type CarRouteSummary,
  type FetchCarRouteParams,
} from "./utils/carRoute";

// How a route's numbers read, everywhere they are shown
export {
  formatDistance,
  formatDuration,
  formatRouteSummary,
  getModeIcon,
  getModeLabel,
} from "./utils/formatters";

// What a route looks like, wherever one is drawn
export { ROUTE_BLUE, ROUTE_CASING, ROUTE_GRAY } from "./utils/routeColors";

// UI Components
export { RouteOptionsDrawer } from "./components/RouteOptionsDrawer";
export { InlineRouteOptions } from "./components/InlineRouteOptions";
