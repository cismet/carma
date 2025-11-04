import { ImageryProvider } from "cesium";
export { ImageryProvider };

export const isValidImageryProvider = (
  provider: unknown
): provider is ImageryProvider => {
  return provider instanceof ImageryProvider;
};
