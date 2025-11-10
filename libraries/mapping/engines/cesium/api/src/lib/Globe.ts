import { Globe } from "cesium";
export { Globe };

export const isValidGlobe = (globe: unknown): globe is Globe => {
  return globe instanceof Globe;
};
