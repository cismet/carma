import * as THREE from "three";

import { clamp } from "@carma-commons/math";
import { degToRadNumeric } from "@carma-units";

import {
  fitShadowMap,
  getSunDiscReceiverGuard,
  resolveShadowMapTexelBudget,
} from "../core/fit-shadow-map";
import type { ShadowQualityMultiplier } from "../core/shadow-types";
import { shadowRasterOffset } from "../core/shadow-raster-offset";

const BASE_SHADOW_MAP_SIZE = 2_048;
const DEFAULT_MAX_SHADOW_MAP_SIZE = 8_192;
const MIN_SHADOW_AREA_METERS = 2;
const MIN_CASTER_REACH_METERS = 50;
const MAX_CASTER_REACH_METERS = 10_000;
const CASTER_REACH_ELEVATION_EPSILON = 0.04;
const LIGHT_CAMERA_SAFETY_METERS = 25;
const SHADOW_DEPTH_BIAS_TEXELS = 4;
const SHADOW_NORMAL_BIAS_TEXELS = 1.2;
const MIN_SHADOW_BIAS_ELEVATION_SINE = 0.2;
const MIN_SHADOW_NORMAL_BIAS_METERS = 0.05;
const MAX_SHADOW_NORMAL_BIAS_METERS = 8;
export const SUN_ANGULAR_RADIUS_RAD = degToRadNumeric(0.53 / 2);
const GOLDEN_ANGLE_RAD = Math.PI * (3 - Math.sqrt(5));

export const CASTER_RELIEF_MARGIN_METERS = 300;

type LightSpaceBounds = Readonly<{
  left: number;
  right: number;
  bottom: number;
  top: number;
  near: number;
  far: number;
}>;

export type ShadowCameraSnapshot = Readonly<{
  receiverPointCount: number;
  receiverLeftMeters: number;
  receiverRightMeters: number;
  receiverBottomMeters: number;
  receiverTopMeters: number;
  leftMeters: number;
  rightMeters: number;
  bottomMeters: number;
  topMeters: number;
  nearMeters: number;
  farMeters: number;
  shadowMapWidth: number;
  shadowMapHeight: number;
  viewMatrixElements: readonly number[];
  projectionMatrixElements: readonly number[];
  guardMeters: number;
  metersPerTexel: number;
  metersPerTexelX?: number;
  metersPerTexelY?: number;
  groundTexelWidthMeters?: number;
  groundTexelHeightMeters?: number;
  groundTexelFitLimited?: boolean;
  groundTexelFit?: boolean;
}>;

export type ShadowSnapshot = Readonly<{
  sampleCount: number;
  totalShadowTexels: number;
  mapTexelBudget?: number;
  casterReachMeters: number;
  camera: ShadowCameraSnapshot;
}>;

export type ShadowUpdate = Readonly<{
  receiverWorldPoints: readonly THREE.Vector3[];
  receiverAnchorWorldPosition: THREE.Vector3;
  minimumElevationMeters: number;
  maximumElevationMeters: number;
  directionToSun: THREE.Vector3;
  color: THREE.ColorRepresentation;
  intensity: number;
  shadowIntensity: number;
  quality: ShadowQualityMultiplier;
  groundTexelFit?: boolean;
  /** Avoid reallocating depth storage for each aspect-ratio change in a gesture. */
  stabilizeMapSize?: boolean;
  /** Total depth texels, independent of the hardware's per-axis limit.
   * Invalid values use the quality policy; positive values clamp to at least
   * 64² texels (the allocation/guard minimum) and at most the hardware limit².
   */
  mapTexelBudget?: number;
}>;

const getReceiverBoundsInLightCamera = (
  points: readonly THREE.Vector3[],
  camera: THREE.OrthographicCamera
): LightSpaceBounds | null => {
  if (points.length === 0) return null;
  camera.updateMatrixWorld(true);
  const projected = points.map((point) =>
    point.clone().applyMatrix4(camera.matrixWorldInverse)
  );
  const left = Math.min(...projected.map(({ x }) => x));
  const right = Math.max(...projected.map(({ x }) => x));
  const bottom = Math.min(...projected.map(({ y }) => y));
  const top = Math.max(...projected.map(({ y }) => y));
  const depths = projected.map(({ z }) => -z);
  const near = Math.max(0, Math.min(...depths));
  const far = Math.max(near + 0.01, Math.max(...depths));
  const centerX = (left + right) / 2;
  const centerY = (bottom + top) / 2;
  const halfWidth = Math.max((right - left) / 2, MIN_SHADOW_AREA_METERS / 2);
  const halfHeight = Math.max((top - bottom) / 2, MIN_SHADOW_AREA_METERS / 2);
  return {
    left: centerX - halfWidth,
    right: centerX + halfWidth,
    bottom: centerY - halfHeight,
    top: centerY + halfHeight,
    near,
    far,
  };
};

const restingShadowMapSize = (
  quality: ShadowQualityMultiplier,
  maxShadowMapSize = DEFAULT_MAX_SHADOW_MAP_SIZE
): number =>
  quality >= 16
    ? maxShadowMapSize
    : Math.min(maxShadowMapSize, BASE_SHADOW_MAP_SIZE * Math.sqrt(quality));

export class ShadowController {
  readonly lights: readonly THREE.DirectionalLight[];

  private softSun = false;
  private lastSoftFit: {
    directionToSun: THREE.Vector3;
    tangentA: THREE.Vector3;
    tangentB: THREE.Vector3;
    anchorPosition: THREE.Vector3;
    lightDistance: number;
    rasterBounds: LightSpaceBounds;
  } | null = null;
  private maxShadowMapSize = DEFAULT_MAX_SHADOW_MAP_SIZE;
  private mapAllocation: {
    width: number;
    height: number;
    texelBudget: number;
    maxMapSize: number;
    groundTexelFit: boolean;
  } | null = null;
  private disposed = false;

  constructor(private readonly hostScene: THREE.Scene) {
    this.lights = Array.from({ length: 1 }, () => {
      const light = new THREE.DirectionalLight(0xffffff, 0);
      light.name = "shadow-simulation-sun";
      light.visible = false;
      light.castShadow = false;
      light.shadow.camera.name = "shadow-simulation-shadow-camera";
      light.shadow.autoUpdate = false;
      light.shadow.radius = 0;
      light.shadow.bias = 0;
      light.shadow.normalBias = MIN_SHADOW_NORMAL_BIAS_METERS;
      hostScene.add(light, light.target);
      return light;
    });
  }

  setMaxShadowMapSize(size: number): void {
    if (!Number.isFinite(size) || size <= 0) return;
    const next = Math.max(256, Math.floor(size));
    if (this.disposed || this.maxShadowMapSize === next) return;
    this.maxShadowMapSize = next;
  }

  setSoftSun(enabled: boolean): void {
    if (this.disposed || this.softSun === enabled) return;
    if (!enabled) this.restoreSunDiscCenter();
    this.softSun = enabled;
    if (!enabled) this.lastSoftFit = null;
  }

  applySunDiscSample(
    round: number,
    sampleCount: number,
    rasterJitter = true
  ): void {
    if (this.disposed) return;
    const fit = this.lastSoftFit;
    if (!fit) return;
    const count = Math.max(1, Math.floor(sampleCount));
    const sampleIndex = ((Math.floor(round) % count) + count) % count;
    const angularOffset =
      SUN_ANGULAR_RADIUS_RAD * Math.sqrt((sampleIndex + 0.5) / count);
    const sampleAngle = sampleIndex * GOLDEN_ANGLE_RAD;
    const offsetA = Math.cos(sampleAngle) * angularOffset;
    const offsetB = Math.sin(sampleAngle) * angularOffset;
    const tangentDirection = fit.tangentA
      .clone()
      .multiplyScalar(offsetA)
      .addScaledVector(fit.tangentB, offsetB)
      .normalize();
    const direction = fit.directionToSun
      .clone()
      .multiplyScalar(Math.cos(angularOffset))
      .addScaledVector(tangentDirection, Math.sin(angularOffset))
      .normalize();
    const light = this.lights[0];
    const [phaseX, phaseY] =
      rasterJitter && count > 1 ? shadowRasterOffset(sampleIndex) : [0, 0];
    const camera = light.shadow.camera;
    const bounds = fit.rasterBounds;
    const shiftX =
      (phaseX * (bounds.right - bounds.left)) / light.shadow.mapSize.x;
    const shiftY =
      (phaseY * (bounds.top - bounds.bottom)) / light.shadow.mapSize.y;
    camera.left = bounds.left + shiftX;
    camera.right = bounds.right + shiftX;
    camera.bottom = bounds.bottom + shiftY;
    camera.top = bounds.top + shiftY;
    camera.updateProjectionMatrix();
    light.position
      .copy(direction)
      .multiplyScalar(fit.lightDistance)
      .add(fit.anchorPosition);
    light.updateMatrixWorld(true);
    light.target.updateMatrixWorld(true);
    light.shadow.updateMatrices(light);
    light.shadow.needsUpdate = true;
  }

  restoreSunDiscCenter(): void {
    if (this.disposed || !this.lastSoftFit) return;
    const fit = this.lastSoftFit;
    const light = this.lights[0];
    const camera = light.shadow.camera;
    camera.left = fit.rasterBounds.left;
    camera.right = fit.rasterBounds.right;
    camera.bottom = fit.rasterBounds.bottom;
    camera.top = fit.rasterBounds.top;
    camera.updateProjectionMatrix();
    light.position
      .copy(fit.directionToSun)
      .multiplyScalar(fit.lightDistance)
      .add(fit.anchorPosition);
    light.updateMatrixWorld(true);
    light.target.updateMatrixWorld(true);
    light.shadow.updateMatrices(light);
    light.shadow.needsUpdate = true;
  }

  invalidate(): void {
    this.lights[0].shadow.needsUpdate = true;
  }

  update({
    receiverWorldPoints,
    receiverAnchorWorldPosition,
    minimumElevationMeters,
    maximumElevationMeters,
    directionToSun,
    color,
    intensity,
    shadowIntensity,
    quality,
    groundTexelFit = true,
    stabilizeMapSize = false,
    mapTexelBudget,
  }: ShadowUpdate): ShadowSnapshot | null {
    if (this.disposed) return null;
    if (receiverWorldPoints.length === 0) {
      for (const light of this.lights) {
        light.visible = false;
        light.castShadow = false;
        light.intensity = 0;
        light.shadow.needsUpdate = false;
      }
      return null;
    }

    const normalizedDirectionToSun = directionToSun.clone().normalize();
    const reliefMeters = Math.max(
      0,
      maximumElevationMeters - minimumElevationMeters
    );
    const elevationSine = Math.max(
      CASTER_REACH_ELEVATION_EPSILON,
      normalizedDirectionToSun.y
    );
    const casterReachMeters = clamp(
      (reliefMeters + CASTER_RELIEF_MARGIN_METERS) / elevationSine +
        MIN_CASTER_REACH_METERS,
      MIN_CASTER_REACH_METERS,
      MAX_CASTER_REACH_METERS
    );
    const lightMargin =
      casterReachMeters + reliefMeters + LIGHT_CAMERA_SAFETY_METERS;
    const restingMapSize = restingShadowMapSize(quality, this.maxShadowMapSize);
    const resolvedMapTexelBudget = resolveShadowMapTexelBudget(
      mapTexelBudget,
      Math.floor(restingMapSize) ** 2,
      this.maxShadowMapSize
    );
    const mapSize = Math.floor(Math.sqrt(resolvedMapTexelBudget));
    const resolvedColor = new THREE.Color(color);
    const targetPosition = receiverAnchorWorldPosition.clone();
    const receiverRadius = receiverWorldPoints.reduce(
      (radius, point) =>
        Math.max(radius, point.distanceTo(receiverAnchorWorldPosition)),
      0
    );
    const lightDistance = receiverRadius + lightMargin;
    const primaryLight = this.lights[0];
    primaryLight.position
      .copy(normalizedDirectionToSun)
      .multiplyScalar(lightDistance)
      .add(targetPosition);
    primaryLight.target.position.copy(targetPosition);
    primaryLight.updateMatrixWorld(true);
    primaryLight.target.updateMatrixWorld(true);
    primaryLight.shadow.updateMatrices(primaryLight);

    const receiverBounds = getReceiverBoundsInLightCamera(
      receiverWorldPoints,
      primaryLight.shadow.camera
    );
    if (!receiverBounds) return null;

    // This camera also selects streamed offscreen casters. Preserve the
    // caster-reach guard; a receiver-only bound would miss some sun-disc rays.
    const receiverSunDiscGuard = getSunDiscReceiverGuard(
      receiverRadius,
      normalizedDirectionToSun.y,
      this.softSun ? SUN_ANGULAR_RADIUS_RAD : 0
    );
    const sunDiscGuardMeters = this.softSun
      ? Math.max(
          Math.tan(SUN_ANGULAR_RADIUS_RAD) * lightDistance,
          receiverSunDiscGuard.planarMeters
        )
      : 0;
    const shadowFit = fitShadowMap(receiverBounds, {
      mapSize,
      mapTexelBudget: resolvedMapTexelBudget,
      maxMapSize: this.maxShadowMapSize,
      elevationSine: normalizedDirectionToSun.y,
      sunDiscGuardMeters,
      groundTexelFit,
      mapDimensions:
        stabilizeMapSize &&
        this.mapAllocation?.texelBudget === resolvedMapTexelBudget &&
        this.mapAllocation.maxMapSize === this.maxShadowMapSize &&
        this.mapAllocation.groundTexelFit === groundTexelFit
          ? this.mapAllocation
          : undefined,
    });
    this.mapAllocation = {
      width: shadowFit.mapWidth,
      height: shadowFit.mapHeight,
      texelBudget: resolvedMapTexelBudget,
      maxMapSize: this.maxShadowMapSize,
      groundTexelFit,
    };
    const metersPerTexel = Math.max(
      shadowFit.metersPerTexelX,
      shadowFit.metersPerTexelY
    );
    const guardMeters = Math.max(
      shadowFit.guardMetersX,
      shadowFit.guardMetersY
    );
    const shadowBounds = {
      left: shadowFit.left,
      right: shadowFit.right,
      bottom: shadowFit.bottom,
      top: shadowFit.top,
      near: Math.max(
        0.01,
        receiverBounds.near -
          receiverSunDiscGuard.depthMeters -
          casterReachMeters -
          reliefMeters -
          LIGHT_CAMERA_SAFETY_METERS
      ),
      far: Math.max(
        1,
        receiverBounds.far +
          receiverSunDiscGuard.depthMeters +
          reliefMeters +
          LIGHT_CAMERA_SAFETY_METERS
      ),
    };
    shadowBounds.far = Math.max(shadowBounds.near + 1, shadowBounds.far);
    const normalBias = clamp(
      (metersPerTexel * SHADOW_NORMAL_BIAS_TEXELS) /
        Math.max(MIN_SHADOW_BIAS_ELEVATION_SINE, normalizedDirectionToSun.y),
      MIN_SHADOW_NORMAL_BIAS_METERS,
      MAX_SHADOW_NORMAL_BIAS_METERS
    );
    const depthBias = -clamp(
      (metersPerTexel * SHADOW_DEPTH_BIAS_TEXELS) /
        Math.max(shadowBounds.far - shadowBounds.near, 1),
      Number.EPSILON,
      0.01
    );
    const tangentA = new THREE.Vector3();
    if (Math.abs(normalizedDirectionToSun.y) > 0.99) {
      tangentA.set(1, 0, 0);
    } else {
      tangentA
        .crossVectors(new THREE.Vector3(0, 1, 0), normalizedDirectionToSun)
        .normalize();
    }
    const tangentB = new THREE.Vector3().crossVectors(
      normalizedDirectionToSun,
      tangentA
    );

    const light = this.lights[0];
    light.visible = true;
    light.castShadow = true;
    light.intensity = intensity;
    light.color.copy(resolvedColor);
    light.shadow.intensity = clamp(shadowIntensity, 0, 1);
    light.shadow.needsUpdate = true;
    if (
      light.shadow.mapSize.x !== shadowFit.mapWidth ||
      light.shadow.mapSize.y !== shadowFit.mapHeight
    ) {
      light.shadow.map?.dispose();
      light.shadow.map = null;
      light.shadow.mapSize.set(shadowFit.mapWidth, shadowFit.mapHeight);
    }
    light.position
      .copy(normalizedDirectionToSun)
      .multiplyScalar(lightDistance)
      .add(targetPosition);
    light.target.position.copy(targetPosition);
    light.shadow.bias = depthBias;
    light.shadow.normalBias = normalBias;
    const camera = light.shadow.camera;
    camera.left = shadowBounds.left;
    camera.right = shadowBounds.right;
    camera.bottom = shadowBounds.bottom;
    camera.top = shadowBounds.top;
    camera.near = shadowBounds.near;
    camera.far = shadowBounds.far;
    camera.updateProjectionMatrix();
    light.updateMatrixWorld(true);
    light.target.updateMatrixWorld(true);
    light.shadow.updateMatrices(light);

    this.lastSoftFit = this.softSun
      ? {
          directionToSun: normalizedDirectionToSun.clone(),
          tangentA,
          tangentB,
          anchorPosition: targetPosition.clone(),
          lightDistance,
          rasterBounds: shadowBounds,
        }
      : null;
    const primaryCamera = primaryLight.shadow.camera;
    return {
      sampleCount: 1,
      totalShadowTexels: shadowFit.mapWidth * shadowFit.mapHeight,
      mapTexelBudget: resolvedMapTexelBudget,
      casterReachMeters,
      camera: {
        receiverPointCount: receiverWorldPoints.length,
        receiverLeftMeters: receiverBounds.left,
        receiverRightMeters: receiverBounds.right,
        receiverBottomMeters: receiverBounds.bottom,
        receiverTopMeters: receiverBounds.top,
        leftMeters: primaryCamera.left,
        rightMeters: primaryCamera.right,
        bottomMeters: primaryCamera.bottom,
        topMeters: primaryCamera.top,
        nearMeters: primaryCamera.near,
        farMeters: primaryCamera.far,
        shadowMapWidth: shadowFit.mapWidth,
        shadowMapHeight: shadowFit.mapHeight,
        viewMatrixElements: [...primaryCamera.matrixWorldInverse.elements],
        projectionMatrixElements: [...primaryCamera.projectionMatrix.elements],
        guardMeters,
        metersPerTexel,
        metersPerTexelX: shadowFit.metersPerTexelX,
        metersPerTexelY: shadowFit.metersPerTexelY,
        groundTexelWidthMeters: shadowFit.groundTexelWidthMeters,
        groundTexelHeightMeters: shadowFit.groundTexelHeightMeters,
        groundTexelFitLimited: shadowFit.groundTexelFitLimited,
        groundTexelFit,
      },
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const light of this.lights) {
      light.shadow.map?.dispose();
      this.hostScene.remove(light.target, light);
    }
  }
}
