import type { Scene } from "./cesium";
import * as CesiumNs from "cesium";

const UNKNOWN_CESIUM_VERSION = "unknown" as const;
export const VERIFIED_PRIVATE_SHIMS_CESIUM_VERSION = "1.134.1" as const;

export type CesiumNamespaceWithVersion = typeof CesiumNs & {
  VERSION?: string;
};

type SceneWithPrivateTweens = Scene & {
  tweens?: unknown[];
};

/**
 * Return the Cesium runtime version if available; otherwise "unknown".
 * We avoid a named import for VERSION because some type bundles do not expose it.
 */
export function getCesiumVersion(): string {
  return (
    (CesiumNs as CesiumNamespaceWithVersion).VERSION || UNKNOWN_CESIUM_VERSION
  );
}

/**
 * Convenience runtime Cesium version constant.
 * Use getCesiumVersion() if you want explicit runtime lookup semantics.
 */
export const VERSION = getCesiumVersion();

/**
 * Cesium private API compat helper for `scene.tweens`.
 *
 * This property is undocumented and intentionally excluded from the curated
 * `@carma-cesium` root surface. Keep all direct access funneled through this
 * module so Cesium upgrades only need one audit point.
 *
 * Build-time verification is enforced against
 * VERIFIED_PRIVATE_SHIMS_CESIUM_VERSION. When Cesium is upgraded, re-check that
 * `scene.tweens` still exists and still behaves as an array-like collection of
 * active tweens before bumping the verified version constant.
 */
export const readCesiumPrivateSceneTweens = (
  scene: Scene
): unknown[] | undefined => {
  const sceneWithTweens = scene as SceneWithPrivateTweens;
  return Array.isArray(sceneWithTweens.tweens)
    ? sceneWithTweens.tweens
    : undefined;
};
