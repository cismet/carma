import proj4 from "proj4";
import { getFachobjektOfProtocol } from "@carma-appframeworks/belis";
import type { ArbeitsauftragDetail } from "../store/slices/arbeitsauftraege";

const proj4crs25832def = "+proj=utm +zone=32 +ellps=GRS80 +units=m +no_defs";
const proj4crs4326def = "+proj=longlat +datum=WGS84 +no_defs";

const FEATURE_TYPE_KEYS = [
  "tdta_leuchten",
  "tdta_standort_mast",
  "schaltstelle",
  "mauerlasche",
  "leitung",
  "abzweigdose",
] as const;

type FeatureTypeKey = (typeof FEATURE_TYPE_KEYS)[number];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getStatusInfo(status: Record<string, any> | null): {
  key: string;
  label: string;
} {
  if (!status?.schluessel) return { key: "unknown", label: "Unbekannt" };
  const s = String(status.schluessel).toLowerCase();
  if (s.includes("offen")) return { key: "offen", label: "Offen" };
  if (s.includes("bearbeitung"))
    return { key: "in_bearbeitung", label: "In Bearbeitung" };
  if (s.includes("erledigt")) return { key: "erledigt", label: "Erledigt" };
  if (s.includes("fehl")) return { key: "fehlmeldung", label: "Fehlmeldung" };
  return { key: "unknown", label: status.bezeichnung ?? "Unbekannt" };
}

/**
 * Derive a solid header color from the protokoll status `bezeichnung`.
 * Uses the same color families as ArbeitsauftraegeSidebar STATUS_COLORS
 * but fully opaque for use as infobox header background.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getHeaderColorFromStatus(status: Record<string, any> | null): string {
  if (!status?.bezeichnung) return "#9CA3AF";
  const b = String(status.bezeichnung).toLowerCase();
  if (b.includes("offen")) return "#F59E0B";
  if (b.includes("bearbeitung")) return "#3B82F6";
  if (b.includes("erledigt")) return "#10B981";
  if (b.includes("fehl")) return "#EF4444";
  return "#9CA3AF";
}

/**
 * Extract a WGS84 geometry from a protokoll's referenced Fachobjekt.
 * Returns a GeoJSON geometry or null if none could be found.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractGeometry(protokoll: Record<string, any>): {
  geometry: GeoJSON.Geometry;
  featureType: FeatureTypeKey;
} | null {
  for (const key of FEATURE_TYPE_KEYS) {
    const ref = protokoll[key];
    if (ref == null) continue;

    // tdta_leuchten uses fk_standort.geom for the point
    let geoField =
      key === "tdta_leuchten"
        ? ref.fk_standort?.geom?.geo_field
        : ref.geom?.geo_field;

    if (!geoField) {
      // fallback to protokoll.geometrie
      geoField = protokoll.geometrie?.geom?.geo_field;
    }
    if (!geoField) continue;

    const converted = convertGeometry(geoField);
    if (converted) return { geometry: converted, featureType: key };
  }

  // Last resort: protokoll.geometrie without a known feature type
  const fallbackGeo = protokoll.geometrie?.geom?.geo_field;
  if (fallbackGeo) {
    const converted = convertGeometry(fallbackGeo);
    if (converted)
      return { geometry: converted, featureType: "tdta_standort_mast" };
  }

  return null;
}

/**
 * Convert an EPSG:25832 GeoJSON geometry to WGS84.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function convertGeometry(geoField: any): GeoJSON.Geometry | null {
  if (!geoField?.type) return null;

  try {
    if (geoField.type === "Point") {
      const [x, y] = geoField.coordinates;
      const [lng, lat] = proj4(proj4crs25832def, proj4crs4326def, [x, y]);
      return { type: "Point", coordinates: [lng, lat] };
    }
    if (geoField.type === "LineString" || geoField.type === "MultiLineString") {
      const coords =
        geoField.type === "LineString"
          ? [geoField.coordinates]
          : geoField.coordinates;
      const converted = coords.map((ring: number[][]) =>
        ring.map(([x, y]: number[]) =>
          proj4(proj4crs25832def, proj4crs4326def, [x, y])
        )
      );
      return geoField.type === "LineString"
        ? { type: "LineString", coordinates: converted[0] }
        : { type: "MultiLineString", coordinates: converted };
    }
    // Fallback for Point-like single coordinate
    return null;
  } catch {
    return null;
  }
}

/**
 * Build a GeoJSON FeatureCollection from the AP data of a selected Arbeitsauftrag.
 * Each feature represents one Arbeitsprotokoll with its referenced Fachobjekt geometry.
 */
export function buildApGeoJson(
  selectedAAData: ArbeitsauftragDetail | null
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];

  if (!selectedAAData?.ar_protokolleArray) {
    return { type: "FeatureCollection", features };
  }

  for (const entry of selectedAAData.ar_protokolleArray) {
    const protokoll = entry.arbeitsprotokoll;
    if (!protokoll) continue;

    const result = extractGeometry(protokoll);
    if (!result) continue;

    const statusInfo = getStatusInfo(protokoll.arbeitsprotokollstatus);
    const fachobjekt = getFachobjektOfProtocol(protokoll);

    features.push({
      type: "Feature",
      geometry: result.geometry,
      properties: {
        id: protokoll.id,
        protokollnummer: protokoll.protokollnummer,
        featureType: result.featureType,
        status: statusInfo.key,
        statusLabel: statusInfo.label,
        headerColor: getHeaderColorFromStatus(protokoll.arbeitsprotokollstatus),
        shortname: fachobjekt?.shortname ?? result.featureType,
        veranlassung: protokoll.veranlassung?.bezeichnung ?? "",
        monteur: protokoll.monteur ?? null,
        datum: protokoll.datum
          ? new Date(protokoll.datum).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })
          : null,
      },
    });
  }

  return { type: "FeatureCollection", features };
}
