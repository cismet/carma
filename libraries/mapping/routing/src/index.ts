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

// UI Components
export { RouteOptionsDrawer } from "./components/RouteOptionsDrawer";
export { InlineRouteOptions } from "./components/InlineRouteOptions";
