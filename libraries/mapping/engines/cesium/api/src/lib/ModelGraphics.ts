import { ModelGraphics } from "cesium";
export { ModelGraphics };

export const isValidModelGraphics = (
  modelGraphics: unknown
): modelGraphics is ModelGraphics => {
  return modelGraphics instanceof ModelGraphics;
};
