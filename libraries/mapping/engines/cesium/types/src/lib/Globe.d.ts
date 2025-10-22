import type { Globe, Color, Rectangle } from "cesium";
import type { ColorConstructor } from "./Color";

/**
 * Globe constructor options with primitive color values
 * @remarks Extends Cesium Globe.ConstructorOptions with primitive baseColor
 */
export type GlobeConstructorOptionsPrimitive = Omit<
  Globe.ConstructorOptions,
  "baseColor"
> & {
  baseColor?: ColorConstructor;
};

/**
 * Globe options for CesiumSceneComponent
 * @remarks Used to configure globe appearance in the scene
 */
export type GlobeOptions = {
  baseColor?: Color | ColorConstructor;
  cartographicLimitRectangle?: Rectangle;
  showGroundAtmosphere?: boolean;
  showSkirts?: boolean;
};
