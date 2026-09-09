import { APP_CONFIG } from "../../config/appConfig";
import { gql } from "./graphql";
import { utmDistance, utmPoint, utmSquare, type Utm } from "./geo";

export interface NearbyAddress {
  street: string;
  number: string;
  /** distance from the placed point in metres */
  distance: number;
}

export interface LocationInfo {
  /** nearest official address point, used when no ALKIS building is hit */
  address?: NearbyAddress;
  stadtbezirk?: string;
}

interface AddressRow {
  hausnummer: string | null;
  strasseObject: { name: string } | null;
  geom: { geo_field: { coordinates: [number, number] } } | null;
}

interface NearbyResponse {
  adresse: AddressRow[];
  kst_stadtbezirk: { name: string }[];
}

const NEARBY_QUERY = `query($window: geometry!, $point: geometry!) {
  adresse(where: { geom: { geo_field: { _st_intersects: $window } } }) {
    hausnummer
    strasseObject { name }
    geom { geo_field }
  }
  kst_stadtbezirk(where: { geom: { geo_field: { _st_intersects: $point } } }) {
    name
  }
}`;

/**
 * What the database can tell about a placed point: the Stadtbezirk and the
 * nearest official address (`adresse` with its `geom` relation). The proxy
 * drops the `from` argument of `_st_d_within`, so the search uses
 * `_st_intersects` with a square around the point instead.
 */
export async function fetchLocationInfo(
  jwt: string,
  utm: Utm
): Promise<LocationInfo> {
  const nearby = await gql<NearbyResponse>(jwt, NEARBY_QUERY, {
    window: utmSquare(utm, APP_CONFIG.addressSearchWindowMeters),
    point: utmPoint(utm),
  });

  const info: LocationInfo = {};
  if (nearby.kst_stadtbezirk.length > 0) {
    info.stadtbezirk = nearby.kst_stadtbezirk[0].name;
  }

  const candidates = nearby.adresse
    .filter((a) => a.geom?.geo_field?.coordinates && a.strasseObject?.name)
    .map((a) => ({
      street: a.strasseObject!.name,
      number: (a.hausnummer ?? "").trim(),
      distance: utmDistance(utm, a.geom!.geo_field.coordinates),
    }))
    .sort((a, b) => a.distance - b.distance);

  if (candidates.length > 0) info.address = candidates[0];
  return info;
}
