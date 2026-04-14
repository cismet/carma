import type { Carma3dConfig, MappedFeature } from "./types";

// ─────────────────────────────────────────────────────────────
//  Generic feature-to-MappedFeature conversion + deduplication
// ─────────────────────────────────────────────────────────────

interface SourceFeature {
  geometry: {
    type: string;
    coordinates: unknown;
  } | null;
  properties: Record<string, unknown> | null;
}

function polygonCentroid(coords: number[][][]): [number, number] | null {
  const ring = coords[0];
  if (!ring || ring.length === 0) return null;
  let sumLng = 0;
  let sumLat = 0;
  for (const pt of ring) {
    sumLng += pt[0];
    sumLat += pt[1];
  }
  return [sumLng / ring.length, sumLat / ring.length];
}

/**
 * Convert source features to MappedFeature[] using the field mapping
 * from a Carma3dConfig.
 */
export function mapFeatures(
  features: SourceFeature[],
  config: Carma3dConfig,
  radiusMix = 0
): MappedFeature[] {
  const result: MappedFeature[] = [];
  const t = Math.max(0, Math.min(1, radiusMix));
  const fields = config.fields!;
  const typeMap = config.typeMap!;
  const defaultType = config.defaultType!;

  for (let srcIdx = 0; srcIdx < features.length; srcIdx++) {
    const f = features[srcIdx];
    const geom = f.geometry;
    if (!geom) continue;
    const props = f.properties ?? {};

    let lng: number;
    let lat: number;

    if (geom.type === "Point") {
      [lng, lat] = geom.coordinates as [number, number];
    } else if (geom.type === "Polygon") {
      const c = polygonCentroid(geom.coordinates as number[][][]);
      if (!c) continue;
      [lng, lat] = c;
    } else if (geom.type === "MultiPolygon") {
      const c = polygonCentroid((geom.coordinates as number[][][][])[0]);
      if (!c) continue;
      [lng, lat] = c;
    } else {
      continue;
    }

    const rawType = String(props[fields.typeField!] ?? "")
      .toUpperCase()
      .trim();
    const typeEntry = typeMap[rawType] ?? typeMap[defaultType];
    if (!typeEntry) continue;
    const type = rawType in typeMap ? rawType : defaultType;

    const hMax = parseFloat(props[fields.heightField!] as string);
    const heightVar = hMax > 0 ? hMax / typeEntry.baseDims.height : 1.0;

    const rInner = parseFloat(props[fields.radiusField!] as string) || 0;
    const rOuter = fields.outerRadiusField
      ? parseFloat(props[fields.outerRadiusField] as string) || rInner
      : rInner;
    const rMax = rInner + (rOuter - rInner) * t;
    const diameterVar = rMax > 0 ? rMax / typeEntry.baseDims.radius : 1.0;

    const rawColor = fields.colorField
      ? (props[fields.colorField] as string) || null
      : null;
    const color = rawColor && rawColor !== "#000000" ? rawColor : null;

    let ring: number[][] | null = null;
    if (fields.ringField && props[fields.ringField]) {
      try {
        const parsed = JSON.parse(props[fields.ringField] as string);
        ring =
          (parsed.coordinates as number[][] | undefined) ??
          (parsed as number[][]);
      } catch {
        // ignore malformed ring data
      }
    }

    const elevation = fields.elevationField
      ? parseFloat(props[fields.elevationField] as string) || 0
      : 0;

    result.push({
      type,
      lng,
      lat,
      elevation,
      heightVar,
      diameterVar,
      rotation: Math.random() * Math.PI * 2,
      color,
      ring,
      heightMax: hMax > 0 ? hMax : typeEntry.baseDims.height,
      radiusMax: rMax > 0 ? rMax : typeEntry.baseDims.radius,
      _sourceIndex: srcIdx,
    });
  }

  return result;
}

/**
 * Remove duplicate features at tile boundaries using coordinate keys.
 */
export function deduplicateFeatures(
  features: SourceFeature[]
): SourceFeature[] {
  const seen = new Set<string>();
  return features.filter((f) => {
    const geom = f.geometry;
    if (!geom) return false;
    let key: string;
    if (geom.type === "Point") {
      const coords = geom.coordinates as [number, number];
      key = `${coords[0].toFixed(7)},${coords[1].toFixed(7)}`;
    } else if (geom.type === "Polygon") {
      const ring = (geom.coordinates as number[][][])[0];
      if (!ring?.[0]) return true;
      key = `${ring[0][0].toFixed(7)},${ring[0][1].toFixed(7)}`;
    } else {
      return true;
    }
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
