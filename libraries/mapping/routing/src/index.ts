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

// Route summary by one mode of travel (time, distance, line, instructions)
export {
  DEFAULT_MAX_DIRECT_TIME,
  fetchRoute,
  type FetchRouteParams,
  type RouteDirection,
  type RouteStep,
  type RouteSummary,
  type TravelMode,
} from "./utils/directRoute";

// How a route's numbers and instructions read, everywhere they are shown
export {
  formatDirection,
  formatDistance,
  formatDuration,
  formatRouteSummary,
  formatTurnDistance,
  getModeIcon,
  getModeLabel,
} from "./utils/formatters";

// What a route looks like, wherever one is drawn
export { ROUTE_BLUE, ROUTE_CASING, ROUTE_GRAY } from "./utils/routeColors";

// UI Components
export { RouteOptionsDrawer } from "./components/RouteOptionsDrawer";
export { InlineRouteOptions } from "./components/InlineRouteOptions";
