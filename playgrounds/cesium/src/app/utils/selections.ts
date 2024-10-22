import { ColorMaterialProperty, Entity, Color } from "cesium";
import ColorHash from "color-hash";

export const getColorMaterialProperty = (
  entity: Entity,
  alpha: number,
  selectKey?: string | null,
  colorLookup: Record<string, Color> = {},
  colorHash: ColorHash = new ColorHash()
): ColorMaterialProperty => {
  const str =
    entity.properties && selectKey
      ? entity.properties[selectKey].toString()
      : "default";
  const colorHexKey = colorHash.hex(str).substring(1); // remove # from the beginning

  // If the Color doesn't exist yet, create it
  if (!colorLookup[colorHexKey]) {
    const [r, g, b] = colorHash.rgb(str);
    colorLookup[colorHexKey] = new Color(r / 255, g / 255, b / 255, alpha);
    return new ColorMaterialProperty(colorLookup[colorHexKey]);
  }

  // Update the transparency of the color only
  colorLookup[colorHexKey].alpha = alpha;
  return new ColorMaterialProperty(colorLookup[colorHexKey]);
};
