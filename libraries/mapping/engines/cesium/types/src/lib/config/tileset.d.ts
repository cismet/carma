import type { Cesium3DTileset, ShadowMode } from "@carma/cesium";
import type { TilesetStyleOptionsPrimitive } from "@carma/cesium/types";
import type { TilesetResourceConfig } from "@carma/types";

type MutableOptions =
  | "opacity"
  | "customShader"
  | "shadows"
  | "show"
  | "colorBlendMode"
  | "maximumScreenSpaceError"
  | "backFaceCulling"
  | "lightColor";

// mutable style options on existing tileset instances
export type TilesetStyle = {
  id?: string; // Name of this style preset
  // Visual style properties (mutable after construction)
  opacity?: number; // Mapped to colorBlendAmount
  customShader?: CustomShader; // Custom shader for visual effects
  shadows?: ShadowMode; // Enable/disable shadows
  show?: boolean; // Visibility (typically managed separately)

  // Advanced mutable properties
  colorBlendMode?: "HIGHLIGHT" | "REPLACE" | "MIX"; // How to blend colors
  // preference for quality might be overridden by scene style or in app
  maximumScreenSpaceError?: number;
  backFaceCulling?: boolean;
  lightColor?: [number, number, number];
};

export type TilesetConfig = TilesetResourceConfig & {
  // REQUIRED: Uniqueness identifier
  id: string;
  // mutable style options on existing tileset instances
  style?: TilesetStyle;

  // changing options here requires a new tileset instance
  options?: Omit<Cesium3DTileset.ConstructorOptions, MutableOptions>;
};
