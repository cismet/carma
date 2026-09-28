/**
 * The area the traffic networks are built for: the printed zoo model, grown
 * by a margin so a vehicle leaving the model has somewhere to go before it
 * disappears. Shared by `build-traffic-network.mjs` (the city's traffic
 * model) and `build-traffic-network-osm.mjs` (OpenStreetMap).
 */
import proj4 from "proj4";

const fromWebMercator = proj4("EPSG:3857", "EPSG:4326");

/**
 * The printed zoo model in EPSG:3857, the `bounds3857` of the outlet route
 * (`apps/geoportal/src/app/constants/fachzwillinge/outlet.ts`).
 */
export const MODEL_BOUNDS_3857 = [788836.855, 6663227.421, 794575.246, 6666423.835];

/** west, south, east, north in degrees: the model grown by `margin` metres */
export const clipBounds = (margin) => {
  const [minX, minY, maxX, maxY] = MODEL_BOUNDS_3857;
  const [west, south] = fromWebMercator.forward([minX, minY]);
  const [east, north] = fromWebMercator.forward([maxX, maxY]);
  const latitude = ((south + north) / 2) * (Math.PI / 180);
  const marginLat = margin / 111320;
  const marginLon = margin / (111320 * Math.cos(latitude));
  return [west - marginLon, south - marginLat, east + marginLon, north + marginLat];
};
