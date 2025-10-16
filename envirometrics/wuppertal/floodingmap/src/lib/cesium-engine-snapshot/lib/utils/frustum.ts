import { PerspectiveFrustum, PerspectiveOffCenterFrustum } from "cesium";

export const isPerspectiveFrustum = (
  frustum: unknown
): frustum is PerspectiveFrustum => {
  return frustum instanceof PerspectiveFrustum;
};

export const isPerspectiveOffCenterFrustum = (
  frustum: unknown
): frustum is PerspectiveOffCenterFrustum => {
  return frustum instanceof PerspectiveOffCenterFrustum;
};

export const isPerspectiveTypeFrustum = (
  frustum: unknown
): frustum is PerspectiveFrustum | PerspectiveOffCenterFrustum => {
  return (
    isPerspectiveFrustum(frustum) || isPerspectiveOffCenterFrustum(frustum)
  );
};
