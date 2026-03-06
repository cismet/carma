// ─────────────────────────────────────────────────────────────
//  Configuration types for generic 3D vector layers
// ─────────────────────────────────────────────────────────────

/** Maps GeoJSON feature property names to semantic roles. */
export interface FieldMapping {
  typeField: string;
  heightField: string;
  radiusField: string;
  outerRadiusField?: string;
  colorField?: string;
  ringField?: string;
}

/** Describes one visual type (e.g. "CONICAL" tree crown shape). */
export interface TypeMapEntry {
  profileName: string;
  defaultColor: string;
  baseDims: { height: number; radius: number };
  trunkFrac: number;
}

/** Full configuration for a carma3d vector layer. */
export interface Carma3dConfig {
  sourceId: string;
  sourceLayer: string;
  mapCenter: [number, number];
  defaultType: string;
  fields: FieldMapping;
  trunkColors: string[];
  typeMap: Record<string, TypeMapEntry>;
}

/** A single feature after field mapping and normalisation. */
export interface MappedFeature {
  type: string;
  lng: number;
  lat: number;
  heightVar: number;
  diameterVar: number;
  rotation: number;
  color: string | null;
  ring: number[][] | null;
  heightMax: number;
  radiusMax: number;
}

/** Profile function: maps t in [0,1] to a radial scale factor. */
export type ProfileFn = (t: number) => number;

/** Stats returned by a factory after rebuilding geometry. */
export interface FactoryStats {
  treeCount: number;
  triangles: number;
  drawCalls: number;
}

/** Performance data exposed to the UI overlay. */
export interface ThreePerfData {
  mode: string;
  treeCount: number;
  triangles: number;
  drawCalls: number;
  syncMs: number;
}
