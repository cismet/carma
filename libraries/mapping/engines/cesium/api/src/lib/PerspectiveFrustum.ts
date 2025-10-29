import { PerspectiveFrustum } from "cesium";

export { PerspectiveFrustum };

export const isPerspectiveFrustum = (
  frustum: unknown
): frustum is PerspectiveFrustum => {
  return frustum instanceof PerspectiveFrustum;
};
