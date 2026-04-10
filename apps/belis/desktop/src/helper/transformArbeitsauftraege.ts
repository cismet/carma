import { getFromUTM32ToWGS84 } from "@carma-geo/proj";
import {
  buffer,
  convex,
  featureCollection,
  feature as turfFeature,
} from "@turf/turf";
import type { ArbeitsauftragTileFeature } from "../store/slices/arbeitsauftraege";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function classifyStatus(bezeichnung: string | null | undefined): string {
  if (!bezeichnung) return "offen";
  const b = bezeichnung.toLowerCase();
  if (b.includes("offen")) return "offen";
  if (b.includes("bearbeitung")) return "in_bearbeitung";
  if (b.includes("erledigt")) return "erledigt";
  if (b.includes("fehl")) return "fehlmeldung";
  return "offen";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function reprojectToWgs84(geoField: any): GeoJSON.Geometry | null {
  if (!geoField?.type) return null;
  try {
    if (geoField.type === "Point") {
      const [x, y] = geoField.coordinates;
      const [lng, lat] = getFromUTM32ToWGS84([x, y]);
      return { type: "Point", coordinates: [lng, lat] };
    }
    if (geoField.type === "LineString" || geoField.type === "MultiLineString") {
      const coords =
        geoField.type === "LineString"
          ? [geoField.coordinates]
          : geoField.coordinates;
      const converted = coords.map((ring: number[][]) =>
        ring.map(([x, y]: number[]) => getFromUTM32ToWGS84([x, y]))
      );
      return geoField.type === "LineString"
        ? { type: "LineString", coordinates: converted[0] }
        : { type: "MultiLineString", coordinates: converted };
    }
    if (geoField.type === "Polygon") {
      const converted = geoField.coordinates.map((ring: number[][]) =>
        ring.map(([x, y]: number[]) => getFromUTM32ToWGS84([x, y]))
      );
      return { type: "Polygon", coordinates: converted };
    }
    return null;
  } catch {
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function computeConvexHull(aa: any): GeoJSON.Geometry | undefined {
  const wgs84Features: GeoJSON.Feature[] = [];

  for (const entry of aa.ar_protokolleArray ?? []) {
    const prot = entry.arbeitsprotokoll;
    if (!prot) continue;

    const geoFields: unknown[] = [
      prot.geometrie?.geom?.geo_field,
      prot.tdta_leuchten?.fk_standort?.geom?.geo_field,
      prot.tdta_standort_mast?.geom?.geo_field,
      prot.schaltstelle?.geom?.geo_field,
      prot.mauerlasche?.geom?.geo_field,
      prot.leitung?.geom?.geo_field,
      prot.abzweigdose?.geom?.geo_field,
    ];

    for (const gf of geoFields) {
      if (!gf) continue;
      const wgs84Geom = reprojectToWgs84(gf);
      if (!wgs84Geom) continue;
      const feat = turfFeature(wgs84Geom);
      const buffered = buffer(feat, 25, { units: "meters" });
      if (buffered) {
        wgs84Features.push(buffered);
      }
    }
  }

  if (wgs84Features.length === 0) return undefined;

  try {
    const collection = featureCollection(wgs84Features);
    const hull = convex(collection);
    return hull?.geometry ?? undefined;
  } catch {
    return undefined;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function transformGqlToTileFeatures(
  arbeitsauftraege: any[] // eslint-disable-line @typescript-eslint/no-explicit-any
): ArbeitsauftragTileFeature[] {
  return arbeitsauftraege.map((aa) => {
    const protokolle = (aa.ar_protokolleArray ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((entry: any) => entry.arbeitsprotokoll)
      .filter(Boolean);

    const total = protokolle.length;
    const counts = { offen: 0, in_bearbeitung: 0, erledigt: 0, fehlmeldung: 0 };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const p of protokolle) {
      const status = classifyStatus(p.arbeitsprotokollstatus?.bezeichnung);
      if (status in counts) {
        counts[status as keyof typeof counts]++;
      }
    }

    return {
      id: aa.id,
      nummer: aa.nummer ?? "",
      team: aa.team?.name ?? "",
      angelegt_am: aa.angelegt_am ?? "",
      angelegt_von: aa.angelegt_von ?? "",
      total_protokolle: total,
      pct_offen: total > 0 ? counts.offen / total : 0,
      pct_in_bearbeitung: total > 0 ? counts.in_bearbeitung / total : 0,
      pct_erledigt: total > 0 ? counts.erledigt / total : 0,
      pct_fehlmeldung: total > 0 ? counts.fehlmeldung / total : 0,
      geometry: computeConvexHull(aa),
    };
  });
}
