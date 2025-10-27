// Re-export PerspectiveOffCenterFrustum class from Cesium
import { PerspectiveOffCenterFrustum } from "cesium";
export { PerspectiveOffCenterFrustum };

// Generic Version of PerspectiveFrustum method-wise
export const isPerspectiveOffCenterFrustum = (
  frustum: unknown
): frustum is PerspectiveOffCenterFrustum => {
  return frustum instanceof PerspectiveOffCenterFrustum;
};
