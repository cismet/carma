import { GroundPrimitive } from "cesium";
export { GroundPrimitive };

export const isValidGroundPrimitive = (
  groundPrimitive: unknown
): groundPrimitive is GroundPrimitive => {
  return (
    groundPrimitive instanceof GroundPrimitive &&
    groundPrimitive.isDestroyed() === false
  );
};
