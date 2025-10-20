// Re-export Model from Cesium
import { Model } from "cesium";
export { Model };

export const isValidModel = (model: unknown): model is Model => {
  return model instanceof Model;
};
