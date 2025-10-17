// Re-export PerspectiveOffCenterFrustum class from Cesium
import { PerspectiveOffCenterFrustum } from "cesium";
export { PerspectiveOffCenterFrustum };

export const isPerspectiveOffCenterFrustum = (
  frustum: unknown
): frustum is PerspectiveOffCenterFrustum => {
  return frustum instanceof PerspectiveOffCenterFrustum;
};
