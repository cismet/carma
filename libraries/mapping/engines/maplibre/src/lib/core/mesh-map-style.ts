import {
  isMapStyleContourLineLayer,
  isMapStyleElevationLabelLayer,
  isMapStyleHouseNumberLabelLayer,
  isMapStylePointLabelLayer,
  isMapStyleRoadLabelLayer,
  isMapStyleRoadShieldLayer,
  isMapStyleWaterLabelLayer,
  type RuntimeStyleLayer,
} from "../runtime/integrations/map-style-layer-suppression";
import {
  isWhiteLabelHalo,
  isTerrainMapStyleLayerHidden,
} from "./terrain-map-style";

/**
 * Textured-mesh map style policy. Keep authored shield colors and water text.
 * Runtime capture, restoration and change detection live in the scene registry.
 */
export const MESH_MAP_STYLE = {
  showHouseNumbers: false,
  contourOpacity: 0.5,
  labelHaloColor: "#808080",
  streetLabelSizeFactor: 1.4,
  streetLabelHaloWidth: 1.5,
} as const;

export const isMeshMapStyleLayerHidden = (
  layer: RuntimeStyleLayer,
  showElevationLines = false,
  showElevationLabels = false
): boolean => {
  if (layer.type === "custom" || layer.id.startsWith("carma-")) return false;
  if (
    isTerrainMapStyleLayerHidden(layer, showElevationLines, showElevationLabels)
  )
    return true;
  if (isMapStyleHouseNumberLabelLayer(layer))
    return !MESH_MAP_STYLE.showHouseNumbers;
  return layer.type !== "symbol" && !isMapStyleContourLineLayer(layer);
};

export type MeshLabelPaintProperty =
  | "text-color"
  | "text-halo-color"
  | "text-halo-width"
  | "text-halo-blur"
  | "icon-color"
  | "text-size";

/** Scale an authored `text-size`; legacy stop functions are left alone. */
const scaleTextSize = (authored: unknown, factor: number): unknown => {
  if (typeof authored === "number")
    return Math.round(authored * factor * 10) / 10;
  if (Array.isArray(authored)) return ["*", factor, authored];
  return undefined;
};

export const isMeshStyledLabelLayer = (layer: RuntimeStyleLayer): boolean =>
  isMapStyleWaterLabelLayer(layer) ||
  isMapStyleElevationLabelLayer(layer) ||
  (isMapStylePointLabelLayer(layer)
    ? // Shields keep their authored text on their own icon backdrop.
      !isMapStyleRoadShieldLayer(layer)
    : isMapStyleRoadLabelLayer(layer));

export const getMeshLabelPaint = (
  layer: RuntimeStyleLayer,
  textColor: string | null,
  authoredProperty: (
    layer: RuntimeStyleLayer,
    property: MeshLabelPaintProperty
  ) => unknown
): Array<[MeshLabelPaintProperty, unknown]> => {
  // Water names keep their authored blue and only drop the halo.
  if (isMapStyleWaterLabelLayer(layer)) return [["text-halo-width", 0]];
  // Contour and spot-height numbers: sun colored, no halo, draped or lifted.
  // Without a sun (shadow simulation off) they stay white.
  if (isMapStyleElevationLabelLayer(layer)) {
    return [
      ["text-color", textColor ?? "#ffffff"],
      ["text-halo-width", 0],
    ];
  }
  // Draped street names are lit and shadowed in place on the mesh, so they
  // stay pure white; only the overlaid point labels take the sun color.
  // They also get more body and a crisp, narrower halo so the halo does
  // not creep into the glyphs on the textured ground.
  if (!isMapStylePointLabelLayer(layer)) {
    const paint: Array<[MeshLabelPaintProperty, unknown]> = [
      ["text-color", "#ffffff"],
      ["text-halo-color", MESH_MAP_STYLE.labelHaloColor],
      ["text-halo-width", MESH_MAP_STYLE.streetLabelHaloWidth],
      ["text-halo-blur", 0],
    ];
    const size = scaleTextSize(
      authoredProperty(layer, "text-size"),
      MESH_MAP_STYLE.streetLabelSizeFactor
    );
    if (size !== undefined) paint.push(["text-size", size]);
    return paint;
  }
  if (textColor === null) return [];
  const paint: Array<[MeshLabelPaintProperty, unknown]> = [
    ["text-color", textColor],
    ["text-halo-color", MESH_MAP_STYLE.labelHaloColor],
  ];
  // Flat white SDF icons (churches, POIs) take the sun color as well.
  if (isWhiteLabelHalo(authoredProperty(layer, "icon-color"))) {
    paint.push(["icon-color", textColor]);
  }
  return paint;
};

export type SpriteImageData = {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray;
};

/** Every visible sprite is lit by the sun; fully transparent ones are skipped. */
export const isSunTintableSprite = ({ data }: SpriteImageData): boolean => {
  for (let index = 3; index < data.length; index += 4) {
    if (data[index] > 0) return true;
  }
  return false;
};

export const parseHexColor = (
  color: string
): [number, number, number] | null => {
  const match = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!match) return null;
  const value = Number.parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
};

export const tintSpriteImage = (
  image: SpriteImageData,
  rgb: [number, number, number]
): SpriteImageData => {
  // The sprite is lit by the sun: its authored color is the albedo, the sun
  // color the light, and the result is their product per channel. White
  // becomes the sun color, a yellow shield a sun-lit yellow, black stays
  // black.
  const data = new Uint8Array(image.data);
  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] === 0) continue;
    data[index] = Math.round((data[index] * rgb[0]) / 255);
    data[index + 1] = Math.round((data[index + 1] * rgb[1]) / 255);
    data[index + 2] = Math.round((data[index + 2] * rgb[2]) / 255);
  }
  return { width: image.width, height: image.height, data };
};
