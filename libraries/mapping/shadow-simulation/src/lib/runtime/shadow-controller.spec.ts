import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import { degToRadNumeric } from "@carma-units";

import { fitShadowMap, getSunDiscReceiverGuard } from "../core/fit-shadow-map";

import { ShadowController, type ShadowUpdate } from "./shadow-controller";

const receiverWorldPoints = [
  new THREE.Vector3(-50, 100, -25),
  new THREE.Vector3(50, 100, -25),
  new THREE.Vector3(50, 140, 25),
  new THREE.Vector3(-50, 140, 25),
];
const SUN_DISC_TEST_RADIUS_RAD = degToRadNumeric(0.53 / 2) + 1e-12;

const buildUpdate = (overrides: Partial<ShadowUpdate> = {}): ShadowUpdate => ({
  receiverWorldPoints,
  receiverAnchorWorldPosition: new THREE.Vector3(0, 100, 0),
  minimumElevationMeters: 100,
  maximumElevationMeters: 140,
  directionToSun: new THREE.Vector3(0.5, 0.7, -0.5).normalize(),
  color: 0xffffff,
  intensity: 2,
  shadowIntensity: 0.8,
  quality: 4,
  groundTexelFit: false,
  ...overrides,
});

describe("ShadowController", () => {
  it("caps mesh receiver offsets at one millimetre even with coarse depth maps", () => {
    const controller = new ShadowController(new THREE.Scene());
    controller.setMaxShadowMapSize(512);
    const snapshot = controller.update(
      buildUpdate({
        maxReceiverBiasMeters: 0.001,
        directionToSun: new THREE.Vector3(1, 0.1, 0).normalize(),
      })
    )!;
    const shadow = controller.lights[0].shadow;
    expect(shadow.normalBias).toBe(0.001);
    expect(
      -shadow.bias * (snapshot.camera.farMeters - snapshot.camera.nearMeters)
    ).toBeCloseTo(0.001, 12);
    controller.applySunDiscSample(4, 64);
    expect(shadow.normalBias).toBe(0.001);
    controller.update(buildUpdate());
    expect(shadow.normalBias).toBeGreaterThan(0.001);
    controller.dispose();
  });

  it("uses texel-sized PCF bias for pages, invariant within the same size class", () => {
    const controller = new ShadowController(new THREE.Scene());
    const update = buildUpdate({
      groundTexelFit: true,
      groundTexelTargetMeters: 0.1,
    });
    const first = controller.update(update)!;
    const shadow = controller.lights[0].shadow;
    const normalBias = shadow.normalBias;
    const depthBias = shadow.bias;
    expect(normalBias).toBeGreaterThan(0.01);
    expect(
      Math.abs(depthBias) * (first.camera.farMeters - first.camera.nearMeters)
    ).toBeGreaterThan(0.01);
    const next = controller.update({
      ...update,
      groundTexelTargetMeters: 0.101,
    })!;
    expect(next.camera.shadowMapWidth).toBe(first.camera.shadowMapWidth);
    expect(shadow.normalBias).toBe(normalBias);
    expect(shadow.bias).toBe(depthBias);
    controller.dispose();
  });
  it("applies the same footprint bias in mono and tiled allocation", () => {
    const controllers = [
      new ShadowController(new THREE.Scene()),
      new ShadowController(new THREE.Scene()),
    ];
    controllers.forEach((controller) => controller.setMaxShadowMapSize(512));
    const update = buildUpdate({
      groundTexelFit: true,
      groundTexelTargetMeters: 0.001,
    });
    const tiled = controllers[0].update(update)!;
    // Force both fits into the same hardware-capped allocation. Their bias must
    // depend on achieved texel size, not on presence of the demand parameter.
    const mono = controllers[1].update({
      ...update,
      groundTexelTargetMeters: undefined,
    })!;
    expect(tiled.camera.shadowMapWidth).toBe(mono.camera.shadowMapWidth);
    expect(tiled.camera.shadowMapHeight).toBe(mono.camera.shadowMapHeight);
    const tiledLight = controllers[0].lights[0].shadow;
    const monoLight = controllers[1].lights[0].shadow;
    expect(tiledLight.normalBias).toBeCloseTo(monoLight.normalBias, 12);
    expect(tiledLight.bias).toBeCloseTo(monoLight.bias, 12);
    controllers.forEach((controller) => controller.dispose());
  });
  it("reuses depth allocation during motion while fitting the current receiver", () => {
    const controller = new ShadowController(new THREE.Scene());
    const initialUpdate = buildUpdate({
      groundTexelFit: true,
      mapTexelBudget: 2048 ** 2,
      directionToSun: new THREE.Vector3(0, 1, 1).normalize(),
    });
    const first = controller.update(initialUpdate)!;
    const target = new THREE.WebGLRenderTarget(
      first.camera.shadowMapWidth,
      first.camera.shadowMapHeight
    );
    const dispose = vi.spyOn(target, "dispose");
    controller.lights[0].shadow.map = target;
    const changedUpdate = {
      ...initialUpdate,
      receiverWorldPoints: receiverWorldPoints.map((point) =>
        point.clone().multiply(new THREE.Vector3(8, 1, 0.5))
      ),
    };
    const moving = controller.update({
      ...changedUpdate,
      stabilizeMapSize: true,
    })!;
    expect(dispose).not.toHaveBeenCalled();
    expect(controller.lights[0].shadow.map).toBe(target);
    expect(moving.camera.shadowMapWidth).toBe(first.camera.shadowMapWidth);
    expect(moving.camera.shadowMapHeight).toBe(first.camera.shadowMapHeight);
    expect(
      moving.camera.rightMeters - moving.camera.leftMeters
    ).toBeGreaterThan(first.camera.rightMeters - first.camera.leftMeters);
    const camera = controller.lights[0].shadow.camera;
    for (const point of changedUpdate.receiverWorldPoints) {
      const projected = point.clone().project(camera);
      expect(Math.abs(projected.x)).toBeLessThan(1);
      expect(Math.abs(projected.y)).toBeLessThan(1);
    }
    const resting = controller.update(changedUpdate)!;
    const reference = new ShadowController(new THREE.Scene());
    expect(resting).toEqual(reference.update(changedUpdate));
    expect(dispose).toHaveBeenCalledOnce();
    expect(controller.lights[0].shadow.map).toBeNull();
    controller.dispose();
    reference.dispose();
  });

  it("honors quality and device limit changes even while allocation is stabilized", () => {
    const controller = new ShadowController(new THREE.Scene());
    const update = buildUpdate({
      groundTexelFit: true,
      stabilizeMapSize: true,
      mapTexelBudget: 2048 ** 2,
    });
    controller.update(update);
    const lowerBudget = controller.update({
      ...update,
      mapTexelBudget: 1024 ** 2,
    })!;
    expect(lowerBudget.totalShadowTexels).toBeLessThanOrEqual(1024 ** 2);
    controller.setMaxShadowMapSize(512);
    const limited = controller.update(update)!;
    expect(limited.camera.shadowMapWidth).toBeLessThanOrEqual(512);
    expect(limited.camera.shadowMapHeight).toBeLessThanOrEqual(512);
    expect(limited.totalShadowTexels).toBeLessThanOrEqual(512 ** 2);
    controller.dispose();
  });

  it("restores the central sun and frustum immediately when soft sun is disabled", () => {
    const controller = new ShadowController(new THREE.Scene());
    controller.setSoftSun(true);
    controller.update(buildUpdate());
    const light = controller.lights[0];
    const position = light.position.clone();
    const projection = light.shadow.camera.projectionMatrix.clone();
    controller.applySunDiscSample(11, 128, true);
    controller.setSoftSun(false);
    expect(light.position.equals(position)).toBe(true);
    expect(light.shadow.camera.projectionMatrix.equals(projection)).toBe(true);
    controller.dispose();
  });

  it("changes only raster phase, preserves the light direction and restores the base frustum", () => {
    const controller = new ShadowController(new THREE.Scene());
    controller.setSoftSun(true);
    controller.update(buildUpdate());
    const light = controller.lights[0];
    const camera = light.shadow.camera;
    const base = {
      left: camera.left,
      right: camera.right,
      top: camera.top,
      bottom: camera.bottom,
      near: camera.near,
      far: camera.far,
    };
    const baseProjection = camera.projectionMatrix.clone();
    const basePosition = light.position.clone();
    controller.applySunDiscSample(10, 128, false);
    const direction = light.position
      .clone()
      .sub(light.target.position)
      .normalize();
    controller.applySunDiscSample(10, 128, true);
    expect(
      light.position
        .clone()
        .sub(light.target.position)
        .normalize()
        .distanceTo(direction)
    ).toBeLessThan(1e-12);
    expect(camera.right - camera.left).toBeCloseTo(base.right - base.left, 10);
    expect(camera.top - camera.bottom).toBeCloseTo(base.top - base.bottom, 10);
    expect(camera.near).toBe(base.near);
    expect(camera.far).toBe(base.far);
    expect(Math.abs(camera.left - base.left)).toBeLessThanOrEqual(
      (base.right - base.left) / light.shadow.mapSize.x / 2
    );
    expect(Math.abs(camera.top - base.top)).toBeLessThanOrEqual(
      (base.top - base.bottom) / light.shadow.mapSize.y / 2
    );
    const firstProjection = camera.projectionMatrix.clone();
    for (let i = 0; i < 20; i += 1)
      controller.applySunDiscSample(10, 128, true);
    expect(camera.projectionMatrix.equals(firstProjection)).toBe(true);
    controller.restoreSunDiscCenter();
    expect(camera.projectionMatrix.equals(baseProjection)).toBe(true);
    expect(light.position.equals(basePosition)).toBe(true);
    controller.dispose();
  });

  it("uses the new fit as an absolute raster origin and leaves point-sun updates unjittered", () => {
    const controller = new ShadowController(new THREE.Scene());
    controller.setSoftSun(true);
    controller.update(buildUpdate());
    controller.applySunDiscSample(3, 128, true);
    const update = buildUpdate({
      directionToSun: new THREE.Vector3(0.1, 1, 0.2).normalize(),
      quality: 16,
    });
    controller.update(update);
    const camera = controller.lights[0].shadow.camera;
    const changedProjection = camera.projectionMatrix.clone();
    controller.applySunDiscSample(3, 128, true);
    controller.restoreSunDiscCenter();
    expect(camera.projectionMatrix.equals(changedProjection)).toBe(true);
    controller.applySunDiscSample(3, 128, true);
    controller.setSoftSun(false);
    controller.update(update);
    const pointProjection = camera.projectionMatrix.clone();
    const pointPosition = controller.lights[0].position.clone();
    controller.applySunDiscSample(3, 128, true);
    expect(camera.projectionMatrix.equals(pointProjection)).toBe(true);
    expect(controller.lights[0].position.equals(pointPosition)).toBe(true);
    controller.dispose();
  });

  it("fits one orthographic buffer to the receiver area", () => {
    const scene = new THREE.Scene();
    const controller = new ShadowController(scene);

    const snapshot = controller.update(buildUpdate());

    expect(snapshot?.sampleCount).toBe(1);
    expect(snapshot?.camera.shadowMapWidth).toBe(4_096);
    expect(snapshot?.camera.shadowMapHeight).toBe(4_096);
    expect(snapshot?.camera.rightMeters).toBeGreaterThan(
      snapshot?.camera.leftMeters ?? Infinity
    );
    expect(snapshot?.camera.topMeters).toBeGreaterThan(
      snapshot?.camera.bottomMeters ?? Infinity
    );
    expect(snapshot?.camera.farMeters).toBeGreaterThan(
      snapshot?.camera.nearMeters ?? Infinity
    );
    expect(controller.lights[0].visible).toBe(true);
    expect(controller.lights).toHaveLength(1);
  });

  it("uses one full-resolution buffer for sun-disc sampling", () => {
    const controller = new ShadowController(new THREE.Scene());
    controller.setSoftSun(true);

    const snapshot = controller.update(buildUpdate());

    expect(snapshot?.sampleCount).toBe(1);
    expect(snapshot?.camera.shadowMapWidth).toBe(4_096);
    expect(controller.lights).toHaveLength(1);
  });

  it("keeps an explicit total texel budget independent from quality and the hardware dimension", () => {
    const controller = new ShadowController(new THREE.Scene());
    controller.setMaxShadowMapSize(16_384);
    const snapshot = controller.update(
      buildUpdate({
        quality: 64,
        mapTexelBudget: 1_234_567.89,
        groundTexelFit: true,
      })
    )!;

    expect(snapshot.mapTexelBudget).toBe(1_234_567);
    expect(snapshot.totalShadowTexels).toBeLessThanOrEqual(1_234_567);
    expect(snapshot.camera.shadowMapWidth).toBeLessThanOrEqual(16_384);
    expect(snapshot.camera.shadowMapHeight).toBeLessThanOrEqual(16_384);
    expect(snapshot.totalShadowTexels).toBeGreaterThan(1_200_000);
    controller.dispose();
  });

  it.each([undefined, 0, -1, NaN, Infinity, -Infinity])(
    "uses the existing quality policy for invalid or absent budget %s",
    (mapTexelBudget) => {
      const controller = new ShadowController(new THREE.Scene());
      const snapshot = controller.update(buildUpdate({ mapTexelBudget }))!;
      expect(snapshot.mapTexelBudget).toBe(4_096 ** 2);
      expect(snapshot.totalShadowTexels).toBe(4_096 ** 2);
      controller.dispose();
    }
  );

  it.each([0.5, 1, 4_095.9])(
    "clamps positive budget %f to the documented 64-square minimum",
    (mapTexelBudget) => {
      const controller = new ShadowController(new THREE.Scene());
      const snapshot = controller.update(buildUpdate({ mapTexelBudget }))!;
      expect(snapshot.mapTexelBudget).toBe(64 ** 2);
      expect(snapshot.totalShadowTexels).toBe(64 ** 2);
      controller.dispose();
    }
  );

  it("caps a large texel budget to the renderer's actual dimension limit", () => {
    const controller = new ShadowController(new THREE.Scene());
    controller.setMaxShadowMapSize(1_024);
    const snapshot = controller.update(
      buildUpdate({ mapTexelBudget: Number.MAX_VALUE })
    )!;
    expect(snapshot.mapTexelBudget).toBe(1_024 ** 2);
    expect(snapshot.totalShadowTexels).toBe(1_024 ** 2);
    controller.dispose();
  });

  it("ignores invalid hardware limits without poisoning the budget", () => {
    const controller = new ShadowController(new THREE.Scene());
    controller.setMaxShadowMapSize(1_024);
    for (const limit of [NaN, Infinity, 0, -1]) {
      controller.setMaxShadowMapSize(limit);
    }
    const snapshot = controller.update(buildUpdate({ quality: 64 }))!;
    expect(snapshot.camera.shadowMapWidth).toBe(1_024);
    expect(snapshot.mapTexelBudget).toBe(1_024 ** 2);
    controller.dispose();
  });

  it("defaults to the ground-projected fit without increasing the texel budget", () => {
    const controller = new ShadowController(new THREE.Scene());
    const snapshot = controller.update(
      buildUpdate({ groundTexelFit: undefined })
    );

    expect(snapshot?.camera.groundTexelFit).toBe(true);
    expect(snapshot?.totalShadowTexels).toBeLessThanOrEqual(4_096 ** 2);
    expect(snapshot?.camera.shadowMapWidth).toBeLessThanOrEqual(8_192);
    expect(snapshot?.camera.shadowMapHeight).toBeLessThanOrEqual(8_192);
    const square = controller.update(buildUpdate({ groundTexelFit: false }))!;
    const snapGuardAllowance = (4_096 - 6) / (4_096 - 7);
    expect(snapshot!.camera.groundTexelWidthMeters!).toBeLessThanOrEqual(
      square.camera.groundTexelWidthMeters! * snapGuardAllowance
    );
    expect(snapshot!.camera.groundTexelHeightMeters!).toBeLessThanOrEqual(
      square.camera.groundTexelHeightMeters! * snapGuardAllowance
    );
    expect(snapshot?.camera.groundTexelFitLimited).toBe(true);
    controller.dispose();
  });

  it.each([1, 5, 15, 35, 62])(
    "keeps a flat receiver's ground texels square at %i degrees sun elevation",
    (elevationDegrees) => {
      const elevation = degToRadNumeric(elevationDegrees);
      const controller = new ShadowController(new THREE.Scene());
      const update = buildUpdate({
        receiverWorldPoints: [
          new THREE.Vector3(-100, 0, -100),
          new THREE.Vector3(100, 0, -100),
          new THREE.Vector3(100, 0, 100),
          new THREE.Vector3(-100, 0, 100),
        ],
        receiverAnchorWorldPosition: new THREE.Vector3(),
        minimumElevationMeters: 0,
        maximumElevationMeters: 0,
        directionToSun: new THREE.Vector3(
          0,
          Math.sin(elevation),
          Math.cos(elevation)
        ),
        groundTexelFit: true,
      });
      const snapshot = controller.update(update)!;
      const camera = controller.lights[0].shadow.camera;
      const mapPixelGroundPoint = (x: number, y: number) => {
        const point = new THREE.Vector3(x, y, 0).applyMatrix4(
          camera.matrixWorld
        );
        // Intersect a parallel light ray with the world-Y=0 reference plane.
        return point.addScaledVector(
          update.directionToSun,
          -point.y / update.directionToSun.y
        );
      };
      const groundOrigin = mapPixelGroundPoint(0, 0);
      const groundX = mapPixelGroundPoint(snapshot.camera.metersPerTexelX!, 0);
      const groundY = mapPixelGroundPoint(0, snapshot.camera.metersPerTexelY!);
      const groundWidth = groundX.distanceTo(groundOrigin);
      const groundHeight = groundY.distanceTo(groundOrigin);

      expect(groundWidth).toBeCloseTo(
        snapshot.camera.groundTexelWidthMeters!,
        8
      );
      expect(groundHeight).toBeCloseTo(
        snapshot.camera.groundTexelHeightMeters!,
        8
      );
      expect(groundWidth / groundHeight).toBeCloseTo(1, 2);
      expect(snapshot.totalShadowTexels).toBeLessThanOrEqual(4_096 ** 2);
      expect(
        snapshot.camera.rightMeters - snapshot.camera.leftMeters
      ).toBeGreaterThan(
        snapshot.camera.topMeters - snapshot.camera.bottomMeters
      );

      const square = controller.update({ ...update, groundTexelFit: false })!;
      expect(
        square.camera.groundTexelHeightMeters! /
          square.camera.groundTexelWidthMeters!
      ).toBeCloseTo(1 / Math.sin(elevation), 8);
      expect(snapshot.camera.groundTexelHeightMeters!).toBeLessThan(
        square.camera.groundTexelHeightMeters!
      );
      controller.dispose();
    }
  );

  it("reuses the depth target when the fitted dimensions remain unchanged", () => {
    const controller = new ShadowController(new THREE.Scene());
    const update = buildUpdate({ groundTexelFit: true });
    controller.update(update);
    const target = new THREE.WebGLRenderTarget(16, 16);
    const dispose = vi.spyOn(target, "dispose");
    controller.lights[0].shadow.map = target;

    controller.update(update);
    expect(controller.lights[0].shadow.map).toBe(target);
    expect(dispose).not.toHaveBeenCalled();

    controller.update({ ...update, groundTexelFit: false });
    expect(controller.lights[0].shadow.map).toBe(target);
    expect(dispose).not.toHaveBeenCalled();

    controller.update({ ...update, quality: 1 });
    expect(dispose).toHaveBeenCalledOnce();
    expect(controller.lights[0].shadow.map).toBeNull();
    controller.dispose();
  });

  it("increases normal bias for grazing sunlight", () => {
    const controller = new ShadowController(new THREE.Scene());
    controller.update(
      buildUpdate({
        directionToSun: new THREE.Vector3(0.2, 0.95, -0.2).normalize(),
      })
    );
    const highSunBias = controller.lights[0].shadow.normalBias;

    controller.update(
      buildUpdate({
        directionToSun: new THREE.Vector3(0.8, 0.08, -0.6).normalize(),
      })
    );

    expect(controller.lights[0].shadow.normalBias).toBeGreaterThan(highSunBias);
  });

  it("scales negative depth bias from the fitted shadow texel size", () => {
    const controller = new ShadowController(new THREE.Scene());

    const snapshot = controller.update(buildUpdate());

    expect(snapshot).not.toBeNull();
    expect(controller.lights[0].shadow.bias).toBeLessThan(0);

    const compactBias = Math.abs(controller.lights[0].shadow.bias);
    controller.update(
      buildUpdate({
        receiverWorldPoints: receiverWorldPoints.map((point) =>
          point.clone().multiplyScalar(100)
        ),
      })
    );

    expect(Math.abs(controller.lights[0].shadow.bias)).toBeGreaterThan(
      compactBias
    );
  });

  it("moves the one light across the sun disc for accumulation rounds", () => {
    const controller = new ShadowController(new THREE.Scene());
    controller.setSoftSun(true);
    controller.update(buildUpdate());
    const before = controller.lights[0].position.clone();

    controller.applySunDiscSample(1, 32);

    expect(controller.lights[0].position.equals(before)).toBe(false);
    expect(controller.lights[0].shadow.needsUpdate).toBe(true);

    controller.restoreSunDiscCenter();

    expect(controller.lights[0].position.distanceTo(before)).toBeLessThan(1e-9);
  });

  it("uses distinct tangent-plane offsets across the whole sun disc", () => {
    const controller = new ShadowController(new THREE.Scene());
    const update = buildUpdate();
    controller.setSoftSun(true);
    controller.update(update);
    const directionToSun = update.directionToSun.clone().normalize();
    const tangentA = new THREE.Vector3(0, 1, 0)
      .cross(directionToSun)
      .normalize();
    const tangentB = directionToSun.clone().cross(tangentA);
    const offsets = Array.from({ length: 32 }, (_, round) => {
      controller.applySunDiscSample(round, 32);
      const sampledDirection = controller.lights[0].position
        .clone()
        .sub(update.receiverAnchorWorldPosition)
        .normalize();
      return [
        sampledDirection.dot(tangentA).toFixed(12),
        sampledDirection.dot(tangentB).toFixed(12),
      ] as const;
    });

    expect(new Set(offsets.map(([x]) => x)).size).toBe(offsets.length);
    expect(new Set(offsets.map(([, y]) => y)).size).toBe(offsets.length);
  });

  it.each([32, 64])(
    "preserves linear HDR illumination across %i sun samples",
    (rounds) => {
      const scene = new THREE.Scene();
      const controller = new ShadowController(scene);
      const skyLight = new THREE.LightProbe();
      skyLight.sh.coefficients[0].set(0.2, 0.3, 0.5);
      scene.add(skyLight);
      const skyCoefficients = skyLight.sh.toArray();
      const radiance = new THREE.Color().setRGB(4, 2, 0.5);
      controller.setSoftSun(true);
      controller.update(buildUpdate({ color: radiance, intensity: 2 }));
      const light = controller.lights[0];

      for (let round = 0; round < rounds; round += 1) {
        controller.applySunDiscSample(round, rounds);
        // Average visibility, not the light power: no per-sample dimming or
        // clamping of HDR values, and shadow sampling never darkens the sky fill.
        expect(light.color.toArray()).toEqual(radiance.toArray());
        expect(light.intensity).toBe(2);
        expect(skyLight.sh.toArray()).toEqual(skyCoefficients);
      }
      controller.restoreSunDiscCenter();
      expect(light.color.toArray()).toEqual(radiance.toArray());
      controller.dispose();
    }
  );

  it("rotates the sun direction around the terrain anchor", () => {
    const controller = new ShadowController(new THREE.Scene());
    const anchor = new THREE.Vector3(20, 123, -40);
    controller.setSoftSun(true);
    controller.update(buildUpdate({ receiverAnchorWorldPosition: anchor }));

    controller.applySunDiscSample(3, 32);

    expect(controller.lights[0].target.position.equals(anchor)).toBe(true);
    const sampledDirection = controller.lights[0].position
      .clone()
      .sub(anchor)
      .normalize();
    expect(
      sampledDirection.angleTo(buildUpdate().directionToSun)
    ).toBeLessThanOrEqual(SUN_DISC_TEST_RADIUS_RAD);
  });

  it("keeps every receiver inside the shadow map for every sun-disc sample", () => {
    const controller = new ShadowController(new THREE.Scene());
    controller.setSoftSun(true);
    controller.update(
      buildUpdate({
        directionToSun: new THREE.Vector3(0.8, 0.05, -0.6).normalize(),
      })
    );

    for (let round = 0; round < 8; round += 1) {
      controller.applySunDiscSample(round, 32);
      const camera = controller.lights[0].shadow.camera;
      for (const point of receiverWorldPoints) {
        const clip = point
          .clone()
          .applyMatrix4(camera.matrixWorldInverse)
          .applyMatrix4(camera.projectionMatrix);
        expect(Math.abs(clip.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(clip.y)).toBeLessThanOrEqual(1);
        expect(Math.abs(clip.z)).toBeLessThanOrEqual(1);
      }
    }
  });

  it.each([0.1, 1, 5, 15, 35, 62, 89.9, 90])(
    "contains all receivers for all 64 sun samples with a rectangular fit at %i degrees",
    (elevationDegrees) => {
      const controller = new ShadowController(new THREE.Scene());
      const elevation = degToRadNumeric(elevationDegrees);
      controller.setSoftSun(true);
      const snapshot = controller.update(
        buildUpdate({
          directionToSun: new THREE.Vector3(
            0.8 * Math.cos(elevation),
            Math.sin(elevation),
            -0.6 * Math.cos(elevation)
          ),
          groundTexelFit: true,
        })
      )!;

      expect(snapshot.totalShadowTexels).toBeLessThanOrEqual(4_096 ** 2);
      for (let round = 0; round < 64; round += 1) {
        controller.applySunDiscSample(round, 64);
        const camera = controller.lights[0].shadow.camera;
        for (const point of receiverWorldPoints) {
          const clip = point
            .clone()
            .applyMatrix4(camera.matrixWorldInverse)
            .applyMatrix4(camera.projectionMatrix);
          expect(Math.abs(clip.x)).toBeLessThanOrEqual(1);
          expect(Math.abs(clip.y)).toBeLessThanOrEqual(1);
          expect(Math.abs(clip.z)).toBeLessThanOrEqual(1);
        }
      }
      controller.dispose();
    }
  );

  it.each([16, 64] as const)(
    "uses the renderer texture limit at quality %i",
    (quality) => {
      const controller = new ShadowController(new THREE.Scene());
      controller.setMaxShadowMapSize(32_768);

      const snapshot = controller.update(buildUpdate({ quality }));

      expect(snapshot?.camera.shadowMapWidth).toBe(32_768);
    }
  );

  it.each([1, 15, 62])(
    "retains sun-disc coverage for kilometre-scale elongated receivers at %i degrees",
    (elevationDegrees) => {
      const controller = new ShadowController(new THREE.Scene());
      controller.setSoftSun(true);
      const elevation = degToRadNumeric(elevationDegrees);
      for (const [halfWidth, halfDepth] of [
        [4_000, 100],
        [100, 4_000],
        [4_000, 4_000],
      ]) {
        const points = [-1, 1].flatMap((x) =>
          [-1, 1].flatMap((z) =>
            [0, 80].map(
              (y) => new THREE.Vector3(x * halfWidth, y, z * halfDepth)
            )
          )
        );
        controller.update(
          buildUpdate({
            receiverWorldPoints: points,
            receiverAnchorWorldPosition: new THREE.Vector3(),
            minimumElevationMeters: 0,
            maximumElevationMeters: 80,
            directionToSun: new THREE.Vector3(
              0.8 * Math.cos(elevation),
              Math.sin(elevation),
              -0.6 * Math.cos(elevation)
            ),
            groundTexelFit: true,
          })
        );
        for (let round = 0; round < 64; round += 1) {
          controller.applySunDiscSample(round, 64);
          const camera = controller.lights[0].shadow.camera;
          for (const point of points) {
            const clip = point
              .clone()
              .applyMatrix4(camera.matrixWorldInverse)
              .applyMatrix4(camera.projectionMatrix);
            expect(Math.abs(clip.x)).toBeLessThanOrEqual(1);
            expect(Math.abs(clip.y)).toBeLessThanOrEqual(1);
            expect(Math.abs(clip.z)).toBeLessThanOrEqual(1);
          }
        }
      }
      controller.dispose();
    }
  );

  it("disables lights without receivers and removes them on disposal", () => {
    const scene = new THREE.Scene();
    const controller = new ShadowController(scene);
    controller.update(buildUpdate());

    expect(
      controller.update(buildUpdate({ receiverWorldPoints: [] }))
    ).toBeNull();
    expect(controller.lights.every(({ visible }) => !visible)).toBe(true);

    controller.dispose();
    expect(
      scene.children.some(({ name }) =>
        name.startsWith("shadow-simulation-sun")
      )
    ).toBe(false);
  });
});

describe("getSunDiscReceiverGuard", () => {
  it("does not enlarge point-source bounds, even at the zenith", () => {
    expect(getSunDiscReceiverGuard(4_000, 1, 0)).toEqual({
      planarMeters: 0,
      depthMeters: 0,
    });
  });

  it("accounts for high-elevation camera yaw instead of only the solar angular radius", () => {
    const guard = getSunDiscReceiverGuard(
      4_000,
      Math.sin(degToRadNumeric(62)),
      SUN_DISC_TEST_RADIUS_RAD
    );
    expect(guard.planarMeters).toBeGreaterThan(
      4_000 * Math.tan(SUN_DISC_TEST_RADIUS_RAD)
    );
    expect(guard.planarMeters).toBeLessThan(60);
    expect(guard.depthMeters).toBeLessThan(19);
  });
});

describe("fitShadowMap", () => {
  it("allocates a tall texture when receiver relief increases the along-sun footprint", () => {
    const fit = fitShadowMap(
      { left: -50, right: 50, bottom: -100, top: 100 },
      {
        mapSize: 4_096,
        maxMapSize: 8_192,
        elevationSine: Math.sin(degToRadNumeric(45)),
        sunDiscGuardMeters: 0,
        groundTexelFit: true,
      }
    );

    expect(fit.mapHeight).toBeGreaterThan(fit.mapWidth);
    expect(fit.mapWidth * fit.mapHeight).toBeLessThanOrEqual(4_096 ** 2);
    expect(
      Math.abs(fit.groundTexelWidthMeters / fit.groundTexelHeightMeters - 1)
    ).toBeLessThan(0.02);
    expect(fit.groundTexelFitLimited).toBe(false);
  });

  it.each([0, 0.001, 0.02, 0.5, 1])(
    "honors dimension/texel caps and reports horizon limits for elevation sine %f",
    (elevationSine) => {
      const fit = fitShadowMap(
        { left: -500, right: 500, bottom: -500, top: 500 },
        {
          mapSize: 2_048,
          maxMapSize: 2_048,
          elevationSine,
          sunDiscGuardMeters: 50,
          groundTexelFit: true,
        }
      );

      expect(fit.mapWidth).toBeGreaterThanOrEqual(64);
      expect(fit.mapHeight).toBeGreaterThanOrEqual(64);
      expect(fit.mapWidth).toBeLessThanOrEqual(2_048);
      expect(fit.mapHeight).toBeLessThanOrEqual(2_048);
      expect(fit.mapWidth * fit.mapHeight).toBeLessThanOrEqual(2_048 ** 2);
      expect(Number.isFinite(fit.left)).toBe(true);
      expect(Number.isFinite(fit.top)).toBe(true);
      expect(fit.groundTexelFitLimited).toBe(elevationSine < 1);
      if (elevationSine === 0)
        expect(fit.groundTexelHeightMeters).toBe(Infinity);
    }
  );

  it("retains a full three-texel guard after independent axis snapping", () => {
    const bounds = { left: 0.137, right: 37.682, bottom: 0.293, top: 151.117 };
    const sunDiscGuardMeters = 7;
    const fit = fitShadowMap(bounds, {
      mapSize: 4_096,
      maxMapSize: 8_192,
      elevationSine: 0.3,
      sunDiscGuardMeters,
      groundTexelFit: true,
    });

    expect(bounds.left - fit.left).toBeGreaterThanOrEqual(
      sunDiscGuardMeters + 3 * fit.metersPerTexelX
    );
    expect(fit.right - bounds.right).toBeGreaterThanOrEqual(
      sunDiscGuardMeters + 3 * fit.metersPerTexelX
    );
    expect(bounds.bottom - fit.bottom).toBeGreaterThanOrEqual(
      sunDiscGuardMeters + 3 * fit.metersPerTexelY
    );
    expect(fit.top - bounds.top).toBeGreaterThanOrEqual(
      sunDiscGuardMeters + 3 * fit.metersPerTexelY
    );
    expect((fit.left + fit.right) / 2 / fit.metersPerTexelX).toBeCloseTo(
      Math.round((fit.left + fit.right) / 2 / fit.metersPerTexelX),
      8
    );
    expect((fit.bottom + fit.top) / 2 / fit.metersPerTexelY).toBeCloseTo(
      Math.round((fit.bottom + fit.top) / 2 / fit.metersPerTexelY),
      8
    );
  });

  it("keeps degenerate aspect ratios within the total budget", () => {
    for (const width of [2, 20, 2_000, 2_000_000]) {
      for (const height of [2, 20, 2_000, 2_000_000]) {
        for (const mapSize of [256, 2_048, 8_192]) {
          const fit = fitShadowMap(
            { left: 0, right: width, bottom: 0, top: height },
            {
              mapSize,
              maxMapSize: 8_192,
              elevationSine: 0.01,
              sunDiscGuardMeters: 0,
              groundTexelFit: true,
            }
          );
          expect(fit.mapWidth).toBeGreaterThanOrEqual(64);
          expect(fit.mapHeight).toBeGreaterThanOrEqual(64);
          expect(fit.mapWidth).toBeLessThanOrEqual(8_192);
          expect(fit.mapHeight).toBeLessThanOrEqual(8_192);
          expect(fit.mapWidth * fit.mapHeight).toBeLessThanOrEqual(
            mapSize ** 2
          );
        }
      }
    }
  });

  it("preserves square-fit detail on each axis when ideal isotropy would reduce it", () => {
    const bounds = { left: -100, right: 100, bottom: -80, top: 80 };
    for (const mapSize of [2_048, 4_096, 8_192]) {
      const options = {
        mapSize,
        maxMapSize: 8_192,
        elevationSine: Math.sin(degToRadNumeric(5)),
        sunDiscGuardMeters: 0,
      };
      const square = fitShadowMap(bounds, {
        ...options,
        groundTexelFit: false,
      });
      const fit = fitShadowMap(bounds, { ...options, groundTexelFit: true });
      // The additional half texel per edge guarantees the full filter guard
      // after snapping. Apart from that explicit guard, neither axis regresses.
      const snapGuardAllowance = (mapSize - 6) / (mapSize - 7);
      expect(fit.metersPerTexelX).toBeLessThanOrEqual(
        square.metersPerTexelX * snapGuardAllowance + 1e-12
      );
      expect(fit.metersPerTexelY).toBeLessThanOrEqual(
        square.metersPerTexelY * snapGuardAllowance + 1e-12
      );
      expect(fit.mapWidth * fit.mapHeight).toBeGreaterThan(mapSize ** 2 * 0.97);
      expect(fit.groundTexelFitLimited).toBe(true);
      expect(
        fit.groundTexelHeightMeters / fit.groundTexelWidthMeters
      ).toBeGreaterThan(1);
    }
  });
});
