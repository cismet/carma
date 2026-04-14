// ─────────────────────────────────────────────────────────────
//  Configuration types for generic 3D vector layers
// ─────────────────────────────────────────────────────────────

/** Maps GeoJSON feature property names to semantic roles.
 *  Tree layers use typeField/radiusField/etc.; building layers use heightField/publicField. */
export interface FieldMapping {
  typeField?: string;
  heightField?: string;
  radiusField?: string;
  outerRadiusField?: string;
  colorField?: string;
  ringField?: string;
  elevationField?: string;
  /** Property name for the public-building flag (e.g. "oeffentl"). Buildings only. */
  publicField?: string;
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
  /** Origin for the Three.js coordinate system. Falls back to VITE_THREEJS_ORIGIN env var, then Wuppertal. */
  mapCenter?: [number, number];
  /** Rendering strategy: "extrusion" for buildings, "lathe"/"loft"/undefined for trees. */
  renderMode?: "extrusion" | "lathe" | "loft";
  defaultType?: string;
  fields?: FieldMapping;
  trunkColors?: string[];
  typeMap?: Record<string, TypeMapEntry>;
  /** Viewport padding for culling off-screen features (fraction of viewport extent, e.g. 0.2 = 20%).
   *  When set, only features within the padded viewport are built as 3D geometry.
   *  Omit or set to undefined to disable viewport culling (all source features are rendered). */
  viewportPadding?: number;
  /** When true, the original 2D layer is hidden (opacity near-zero) while the 3D layer is active. */
  skipIn2D?: boolean;
  /** Layer IDs to hide when skipIn2D is active. Populated during config detection, not from metadata. */
  skipIn2DLayerIds?: string[];
}

/** A single feature after field mapping and normalisation. */
export interface MappedFeature {
  type: string;
  lng: number;
  lat: number;
  elevation: number;
  heightVar: number;
  diameterVar: number;
  rotation: number;
  color: string | null;
  ring: number[][] | null;
  heightMax: number;
  radiusMax: number;
  /** Index into the source feature array (set by mapFeatures). */
  _sourceIndex: number;
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
  /** Total features from source tiles (before viewport filter) */
  sourceCount?: number;
  triangles: number;
  drawCalls: number;
  syncMs: number;
}
