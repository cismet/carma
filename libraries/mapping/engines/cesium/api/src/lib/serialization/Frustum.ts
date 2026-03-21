import type { Matrix4 } from "../cesium";

export type SerializedPerspectiveFrustum = {
  type: "PerspectiveFrustum";
  fov?: number;
  fovy?: number;
  aspectRatio?: number;
  near?: number;
  far?: number;
  projectionMatrix?: Matrix4;
};

export type SerializedOrthographicFrustum = {
  type: "OrthographicFrustum";
  width?: number;
  aspectRatio?: number;
  near?: number;
  far?: number;
  projectionMatrix?: Matrix4;
};

export type SerializedOrthographicOffCenterFrustum = {
  type: "OrthographicOffCenterFrustum";
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
  near?: number;
  far?: number;
  projectionMatrix?: Matrix4;
};

export type SerializedCesiumFrustum =
  | SerializedPerspectiveFrustum
  | SerializedOrthographicFrustum
  | SerializedOrthographicOffCenterFrustum;
