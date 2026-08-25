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
  /**
   * Property carrying the roof colour as a hex string, `"#rrggbb"` or
   * `"#rgb"`. A leading `#` is optional, since a column of bare hex is common.
   * Buildings only.
   *
   * Naming it is what switches feature colours on, the way `heightField` is
   * what makes a layer extrudable. A feature whose value is missing or
   * unreadable keeps the default colour rather than turning black, so a partly
   * filled column is still usable.
   */
  roofColorField?: string;
  /**
   * Property carrying the wall colour, read the same way as `roofColorField`.
   * Buildings only.
   *
   * Omitted, walls stay a shade of their own roof, which is what they have
   * always been.
   */
  wallColorField?: string;
}

/**
 * Colours taken from what a feature already says about itself.
 *
 * For data that carries a category rather than a colour: the building's
 * function, its type, whatever the source happens to have. The value is looked
 * up as a string, so numeric codes work without quoting rules.
 *
 * `default` covers every value not listed, and a feature missing the property
 * altogether, so a partial table colours what it knows and leaves the rest
 * uniform instead of blank.
 */
export interface ColorMapping {
  /** the property to read, e.g. "geb_fkt" */
  field: string;
  /** value as it appears in the data -> hex string */
  values: Record<string, string>;
  /** for anything not in `values`, and for features without the property */
  default?: string;
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
  /**
   * How opaque the buildings are, 0 to 1. Buildings only; defaults to the
   * 0.65 the meshes are built with.
   *
   * The default lets the map read through the walls, which is what you want
   * while every building is the same flat grey. Once the colours carry the
   * information, the imagery underneath fights them: a light plaster tone over
   * a dark aerial comes out muddy. Set it to 1 for solid buildings, which also
   * turns the material's transparency off rather than leaving it on at full
   * alpha.
   *
   * `buildingOpacity` in the runtime params overrides this.
   */
  buildingOpacity?: number;
  /**
   * Roof colour from a category the features already carry, when they carry no
   * colour of their own. Buildings only.
   *
   * `fields.roofColorField` wins where both are set: a colour in the data is
   * more specific than a colour derived from a class.
   */
  roofColorMap?: ColorMapping;
  /**
   * Wall colour from a category, read the same way as `roofColorMap`.
   *
   * Omitted, walls stay a shade of whatever the roof ended up, which is what
   * they have always been.
   */
  wallColorMap?: ColorMapping;
  /**
   * How sharp a turn between two polygon edges counts as a corner, in degrees.
   * Buildings only; defaults to 20.
   *
   * Consecutive edges that turn by less are treated as one wall, so a curved
   * facade made of many short segments takes one colour instead of one per
   * segment. Raise it to merge more, lower it to split more.
   */
  wallAngleThreshold?: number;
  /** When true, the original 2D layer is hidden (opacity near-zero) while the 3D layer is active. */
  skipIn2D?: boolean;
  /**
   * The opacity the host asked of the layer this config belongs to, 0 to 1.
   * Populated during config detection, not from metadata.
   *
   * A layer's opacity reaches a 2D layer as paint properties, which a three.js
   * layer has none of, so the layer bar's slider would otherwise do nothing to
   * it. Multiplied with `buildingOpacity`, the same way the 2D side multiplies
   * the slider with the style's own opacity.
   */
  layerOpacity?: number;
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
