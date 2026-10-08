import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LngLat,
  MercatorCoordinate,
  type Map as MaplibreMap,
  type PaddingOptions,
} from "maplibre-gl";
import { MercatorTransform } from "maplibre-gl/src/geo/projection/mercator_transform";
import { Matrix4, Plane, Ray, Vector3 } from "three";
import {
  degToRadNumeric,
  radToDegNumeric,
  type Degrees,
  type Radians,
  type Ratio,
} from "@carma-units";
import { Easing, shortestAngleDelta } from "@carma-commons/math";
import { capObliqueAnimationDuration, dynamicDurationMs } from "./cameraMath";
import type { ObliquePreviewState } from "../../core/types";
import type { PreviewImageGeometry } from "../../core/utils/preview-pan-bounds";

import { flyToPose, settleToPitch } from "./flyToImage";
import { acquirePreviewProjectionWindow } from "./preview-projection-window";

// Use MapLibre's real geometry without initializing its bundled WebGL worker.
vi.mock("maplibre-gl", async () => {
  const { MercatorCoordinate } = await import(
    "maplibre-gl/src/geo/mercator_coordinate"
  );
  const { LngLat } = await import("maplibre-gl/src/geo/lng_lat");
  return { MercatorCoordinate, LngLat };
});
vi.mock("@carma-mapping/engines/maplibre", () => ({
  zoom512as256: (zoom: number) => zoom + 1,
  zoom256as512: (zoom: number) => zoom - 1,
}));
vi.mock("./obliqueCamera", () => ({
  setFov: (map: MaplibreMap, fov: number) => map.setVerticalFieldOfView(fov),
  whenMoveEnds: vi.fn(),
}));

const frames = new Map<number, FrameRequestCallback>();
let frameId = 0;
beforeEach(() => {
  frames.clear();
  vi.spyOn(performance, "now").mockReturnValue(0);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback);
    return frameId;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const advance = (time: number) => {
  const pending = [...frames.values()];
  frames.clear();
  pending.forEach((callback) => callback(time));
};

const setup = ({
  zoom = 25.4,
  height = 0,
  pitch = 45,
  fov = 0.1,
  viewportWidth = 800,
  viewportHeight = 600,
} = {}) => {
  const transform = new MercatorTransform({ maxZoom: 30, maxPitch: 85 });
  transform.resize(viewportWidth, viewportHeight);
  transform.setCenter(new LngLat(7.2, 51.27));
  transform.setFov(fov);
  transform.setPitch(pitch);
  transform.setBearing(324.76);
  transform.setZoom(zoom);
  const terrain = {
    getElevationForLngLatZoom: () => height,
    getElevationForLngLat: () => height,
    pointCoordinate: (point: typeof transform.centerPoint) => {
      const inverse = new Matrix4()
        .fromArray(transform.modelViewProjectionMatrix)
        .invert();
      const x = (2 * point.x) / transform.width - 1;
      const y = 1 - (2 * point.y) / transform.height;
      const near = new Vector3(x, y, -1).applyMatrix4(inverse);
      const far = new Vector3(x, y, 1).applyMatrix4(inverse);
      const hit = new Ray(near, far.sub(near).normalize()).intersectPlane(
        new Plane(new Vector3(0, 0, 1), -height),
        new Vector3()
      );
      return hit
        ? new MercatorCoordinate(
            hit.x / transform.worldSize,
            hit.y / transform.worldSize
          )
        : null;
    },
  };
  const map = {
    transform,
    terrain,
    stop: vi.fn(),
    getPadding: () => transform.padding,
    getVerticalFieldOfView: () => transform.fov,
    setVerticalFieldOfView: (fov: number) => transform.setFov(fov),
    getZoom: () => transform.zoom,
    getBearing: () => transform.bearing,
    getPitch: () => transform.pitch,
    getMaxZoom: () => transform.maxZoom,
    getMinZoom: () => transform.minZoom,
    getCenter: () => transform.center,
    getCenterElevation: () => transform.elevation,
    setCenterClampedToGround: vi.fn(),
    queryTerrainElevation: () => height,
    unproject: ([x, y]: number[]) => {
      const point = transform.centerPoint.clone();
      point.x = x;
      point.y = y;
      return transform.screenPointToLocation(point, terrain as never);
    },
    jumpTo: vi.fn(
      (next: {
        center: LngLat;
        zoom: number;
        pitch?: number;
        bearing?: number;
        roll?: number;
        elevation: number;
        padding?: PaddingOptions;
      }) => {
        transform.setCenter(next.center);
        transform.setZoom(next.zoom);
        transform.setElevation(next.elevation);
        if (next.pitch !== undefined) transform.setPitch(next.pitch);
        if (next.bearing !== undefined) transform.setBearing(next.bearing);
        if (next.roll !== undefined) transform.setRoll(next.roll);
        if (next.padding) transform.setPadding(next.padding);
      }
    ),
  } as unknown as MaplibreMap;
  const release = acquirePreviewProjectionWindow(map);
  transform.setPadding({ left: 2400, right: 0, top: 0, bottom: 700 });
  return { map, transform, terrain, release };
};

describe("preview camera return", () => {
  it.each([
    {
      fromBearing: 350,
      toBearing: 10,
      fromPitch: 15,
      toPitch: 50,
      fromFov: 8,
      toFov: 34,
      zoom: 21,
      maxZoom: 30,
      reduction: false,
    },
    {
      fromBearing: 10,
      toBearing: 350,
      fromPitch: 70,
      toPitch: 42,
      fromFov: 30,
      toFov: 65,
      zoom: 18.5,
      maxZoom: 30,
      reduction: false,
    },
    {
      fromBearing: 324,
      toBearing: 54,
      fromPitch: 60,
      toPitch: 42,
      fromFov: 0.1,
      toFov: 34,
      zoom: 30,
      maxZoom: 18.5,
      reduction: true,
    },
  ])(
    "settles rotation $fromBearing→$toBearing and pitch $fromPitch→$toPitch on one anchored progress",
    async ({
      fromBearing,
      toBearing,
      fromPitch,
      toPitch,
      fromFov,
      toFov,
      zoom,
      maxZoom,
      reduction,
    }) => {
      const { map, transform, release } = setup({
        fov: fromFov,
        pitch: fromPitch,
        zoom,
        height: 250,
      });
      transform.setElevation(250);
      transform.setBearing(fromBearing);
      const target = MercatorCoordinate.fromLngLat(
        map.unproject([400, 300]),
        250
      );
      const unit = target.meterInMercatorCoordinateUnits();
      const project = (offset = new Vector3()) => {
        const clip = new Vector3(
          (target.x + offset.x * unit) * transform.worldSize,
          (target.y + offset.y * unit) * transform.worldSize,
          250 + offset.z
        ).applyMatrix4(
          new Matrix4().fromArray(transform.modelViewProjectionMatrix)
        );
        return new Vector3((clip.x + 1) * 400, (1 - clip.y) * 300, 0);
      };
      const read = () => {
        const point = project();
        const bearing = transform.bearingInRadians,
          pitch = transform.pitchInRadians;
        return {
          point,
          pitch: transform.pitch,
          bearing: transform.bearing,
          fov: transform.fov,
          scales: [
            project(
              new Vector3(Math.cos(bearing), Math.sin(bearing), 0)
            ).distanceTo(point),
            project(
              new Vector3(
                Math.sin(bearing) * Math.cos(pitch),
                -Math.cos(bearing) * Math.cos(pitch),
                Math.sin(pitch)
              )
            ).distanceTo(point),
          ],
        };
      };
      const initial = read();
      const lockedPoint = reduction ? initial.point : new Vector3(400, 300, 0);
      const bearingDelta = shortestAngleDelta(
        degToRadNumeric(initial.bearing),
        degToRadNumeric(toBearing)
      );
      const flight = settleToPitch(map, toPitch, {
        bearingDeg: toBearing,
        screenPoint: reduction ? initial.point : undefined,
        fovDeg: toFov as Degrees,
        maxZoom,
        anchor: target,
        padding: { left: 0, right: 0, top: 0, bottom: 0 },
        durationMs: 500,
        restoreGround: false,
      });
      const samples = [0, 50, 125, 250, 375, 450, 499, 500].map((time) => {
        advance(time);
        if (reduction) {
          const eye = transform.getCameraLngLat();
          expect(
            Number.isFinite(eye.lng + eye.lat + transform.getCameraAltitude())
          ).toBe(true);
        }
        return read();
      });
      await flight.done;
      const final = samples.at(-1)!;
      let lastProgress = 0;
      for (const sample of samples) {
        const pitchProgress =
          (sample.pitch - initial.pitch) / (toPitch - initial.pitch);
        const headingProgress =
          shortestAngleDelta(
            degToRadNumeric(initial.bearing),
            degToRadNumeric(sample.bearing)
          ) / bearingDelta;
        expect(headingProgress).toBeCloseTo(pitchProgress, 9);
        expect(pitchProgress).toBeGreaterThanOrEqual(lastProgress - 1e-9);
        expect(pitchProgress).toBeLessThanOrEqual(1 + 1e-9);
        if (reduction) {
          expect(
            sample.scales.every((scale) => Number.isFinite(scale) && scale > 0)
          ).toBe(true);
          expect(
            Number.isFinite(sample.fov + sample.pitch + sample.bearing)
          ).toBe(true);
        }
        expect(
          sample.point.x,
          `initialX=${initial.point.x}; progress=${pitchProgress}`
        ).toBeCloseTo(lockedPoint.x, 2);
        expect(sample.point.y).toBeCloseTo(lockedPoint.y, 2);
        sample.scales.forEach((scale, index) =>
          expect(scale / initial.scales[index]).toBeCloseTo(
            Math.pow(
              final.scales[index] / initial.scales[index],
              pitchProgress
            ),
            4
          )
        );
        lastProgress = pitchProgress;
      }
      const early = samples[1];
      expect(Math.abs(early.pitch - initial.pitch)).toBeGreaterThan(0.01);
      expect(
        Math.abs(
          radToDegNumeric(
            shortestAngleDelta(
              degToRadNumeric(initial.bearing),
              degToRadNumeric(early.bearing)
            )
          )
        )
      ).toBeGreaterThan(0.01);
      expect(early.pitch).not.toBe(toPitch);
      expect(early.fov).not.toBeCloseTo(initial.fov, 8);
      expect(final.pitch).toBe(toPitch);
      expect(
        shortestAngleDelta(
          degToRadNumeric(final.bearing),
          degToRadNumeric(toBearing)
        )
      ).toBeCloseTo(0, 10);
      expect(final.fov).toBeCloseTo(toFov, 10);
      expect(transform.zoom).toBeLessThanOrEqual(maxZoom);
      expect(transform.padding).toEqual({
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
      });
      final.scales.forEach((scale, index) => {
        if (reduction) expect(scale / initial.scales[index]).toBeLessThan(1);
        else expect(scale / initial.scales[index]).toBeCloseTo(1, 4);
      });
      expect(final.point.distanceTo(samples.at(-2)!.point)).toBeLessThan(0.02);
      expect(frames.size).toBe(0);
      const writes = vi.mocked(map.jumpTo).mock.calls.length;
      advance(750);
      advance(1000);
      expect(map.jumpTo).toHaveBeenCalledTimes(writes);
      expect(read()).toEqual(final);
      release();
    }
  );

  it.each([
    { fov: 30, endFov: 30, zoom: 18.5, height: 0, x: 400, y: 300 },
    { fov: 0.1, endFov: 10, zoom: 25.4, height: 250, x: 400, y: 300 },
    { fov: 30, endFov: 70, zoom: 18.5, height: 0, x: 240, y: 360 },
  ])(
    "tracks position and both camera-plane pixel scales: $fov → $endFov",
    async ({ fov, endFov, zoom, height, x, y }) => {
      const { map, transform, release } = setup({ fov, zoom, height });
      const target = MercatorCoordinate.fromLngLat(
        map.unproject([x, y]),
        height
      );
      const unit = target.meterInMercatorCoordinateUnits();
      const bearing = transform.bearingInRadians;
      const pitch = transform.pitchInRadians;
      const right = new Vector3(Math.cos(bearing), Math.sin(bearing), 0);
      const up = new Vector3(
        Math.sin(bearing) * Math.cos(pitch),
        -Math.cos(bearing) * Math.cos(pitch),
        Math.sin(pitch)
      );
      const project = (offset: Vector3) => {
        const p = new Vector3(
          (target.x + offset.x * unit) * transform.worldSize,
          (target.y + offset.y * unit) * transform.worldSize,
          height + offset.z
        ).applyMatrix4(
          new Matrix4().fromArray(transform.modelViewProjectionMatrix)
        );
        return new Vector3((p.x + 1) * 400, (1 - p.y) * 300, 0);
      };
      const scales = () => {
        const centre = project(new Vector3());
        return [
          project(right).distanceTo(centre),
          project(up).distanceTo(centre),
        ];
      };
      const initial = scales();
      const beforeEye = {
        lngLat: transform.getCameraLngLat(),
        altitude: transform.getCameraAltitude(),
      };
      const flight = settleToPitch(map, 45, {
        fovDeg: endFov as Degrees,
        anchor: target,
        screenPoint: { x, y },
        maxZoom: 30,
        durationMs: 1000,
        padding: { left: 0, right: 0, top: 0, bottom: 0 },
        restoreGround: false,
      });
      advance(0);
      expect(transform.getCameraAltitude()).toBeCloseTo(beforeEye.altitude, 5);
      expect(transform.getCameraLngLat().lng).toBeCloseTo(
        beforeEye.lngLat.lng,
        7
      );
      expect(transform.getCameraLngLat().lat).toBeCloseTo(
        beforeEye.lngLat.lat,
        7
      );
      for (const time of [100, 250, 500, 750, 900, 1000]) {
        advance(time);
        const centre = project(new Vector3());
        expect(centre.x).toBeCloseTo(x, 2);
        expect(centre.y).toBeCloseTo(y, 2);
        scales().forEach((scale, index) =>
          expect(scale / initial[index]).toBeCloseTo(1, 5)
        );
      }
      await flight.done;
      expect(transform.fov).toBeCloseTo(endFov, 10);
      expect(map.setCenterClampedToGround).not.toHaveBeenCalledWith(true);
      const eye = transform.getCameraLngLat();
      release();
      expect(transform.getCameraLngLat().lng).toBeCloseTo(eye.lng, 7);
      expect(transform.getCameraLngLat().lat).toBeCloseTo(eye.lat, 7);
    }
  );

  it.each([0, 250])(
    "retains the visible ground point at height %s throughout a panned return",
    async (height) => {
      const { map, transform, terrain, release } = setup({ height });
      const target = map.unproject([400, 300]);
      const before = {
        camera: transform.getCameraLngLat(),
        altitude: transform.getCameraAltitude(),
        zoom: transform.zoom,
        fov: transform.fov,
        padding: transform.padding,
      };
      const flight = settleToPitch(map, 45, {
        fovDeg: 34 as Degrees,
        maxZoom: 22,
        durationMs: 1000,
        padding: { left: 0, right: 0, top: 0, bottom: 0 },
      });
      expect(map.jumpTo).not.toHaveBeenCalled();
      advance(0);
      expect(transform.getCameraAltitude()).toBeCloseTo(before.altitude, 5);
      expect(transform.getCameraLngLat().lng).toBeCloseTo(before.camera.lng, 7);
      expect(transform.getCameraLngLat().lat).toBeCloseTo(before.camera.lat, 7);
      for (const time of [100, 250, 500, 750, 900, 1000]) {
        advance(time);
        const screen = transform.locationToScreenPoint(
          target,
          terrain as never
        );
        expect(screen.x).toBeCloseTo(400, 1);
        expect(screen.y).toBeCloseTo(300, 1);
        expect(Number.isFinite(transform.zoom)).toBe(true);
      }
      await flight.done;
      expect(transform.fov).toBeCloseTo(34, 10);
      expect(transform.zoom).toBeLessThanOrEqual(22);
      expect(transform.padding).toEqual({
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
      });
      expect(map.setCenterClampedToGround).toHaveBeenLastCalledWith(true);
      const eye = transform.getCameraLngLat();
      release();
      expect(transform.getCameraLngLat().lng).toBeCloseTo(eye.lng, 7);
      expect(transform.getCameraLngLat().lat).toBeCloseTo(eye.lat, 7);
    }
  );

  it.each([20, 30])(
    "moves the camera on one path even with maximum zoom %s",
    async (maxZoom) => {
      const { map, transform, release } = setup({ height: 250 });
      const origin = MercatorCoordinate.fromLngLat(transform.getCameraLngLat());
      const unit = origin.meterInMercatorCoordinateUnits();
      const eye = () => {
        const coordinate = MercatorCoordinate.fromLngLat(
          transform.getCameraLngLat()
        );
        return new Vector3(
          (coordinate.x - origin.x) / unit,
          (coordinate.y - origin.y) / unit,
          transform.getCameraAltitude()
        );
      };
      const start = eye();
      const flight = settleToPitch(map, 45, {
        fovDeg: 10 as Degrees,
        maxZoom,
        durationMs: 1000,
        padding: { left: 0, right: 0, top: 0, bottom: 0 },
      });
      advance(500);
      const middle = eye();
      advance(1000);
      await flight.done;
      const end = eye();
      expect(middle.distanceTo(start.clone().lerp(end, 0.5))).toBeLessThan(
        0.02
      );
      release();
    }
  );

  it("preserves a roof target's scale when restoring a lower terrain reference", async () => {
    const { map, transform, release } = setup({ height: 250 });
    const inverse = new Matrix4()
      .fromArray(transform.modelViewProjectionMatrix)
      .invert();
    const near = new Vector3(0, 0, -1).applyMatrix4(inverse);
    const far = new Vector3(0, 0, 1).applyMatrix4(inverse);
    const roof = new Ray(near, far.sub(near).normalize()).intersectPlane(
      new Plane(new Vector3(0, 0, 1), -300),
      new Vector3()
    )!;
    const anchor = new MercatorCoordinate(
      roof.x / transform.worldSize,
      roof.y / transform.worldSize,
      MercatorCoordinate.fromLngLat(transform.center, 300).z
    );
    const targetHeight = anchor.toAltitude();
    const right = new Vector3(
      Math.cos(transform.bearingInRadians),
      Math.sin(transform.bearingInRadians),
      0
    );
    const project = (offset = 0) => {
      const unit = anchor.meterInMercatorCoordinateUnits();
      const point = new Vector3(
        (anchor.x + offset * right.x * unit) * transform.worldSize,
        (anchor.y + offset * right.y * unit) * transform.worldSize,
        targetHeight
      ).applyMatrix4(
        new Matrix4().fromArray(transform.modelViewProjectionMatrix)
      );
      return new Vector3((point.x + 1) * 400, (1 - point.y) * 300, 0);
    };
    const screenPoint = project();
    const initialScale = project(1).distanceTo(screenPoint);
    const flight = settleToPitch(map, 45, {
      anchor,
      screenPoint,
      fovDeg: 10 as Degrees,
      maxZoom: 30,
      durationMs: 1000,
      padding: { left: 0, right: 0, top: 0, bottom: 0 },
    });
    for (const time of [0, 250, 500, 750, 999, 1000]) {
      advance(time);
      const point = project();
      expect(point.distanceTo(screenPoint)).toBeLessThan(0.02);
      expect(project(1).distanceTo(point) / initialScale).toBeCloseTo(1, 4);
    }
    await flight.done;
    expect(transform.elevation).toBe(250);
    release();
  });

  it("reaches the mesh zoom limit and nadir pitch smoothly before cleanup", async () => {
    const { map, transform, release } = setup({ zoom: 30, pitch: 45 });
    const flight = settleToPitch(map, 0, {
      fovDeg: 34 as Degrees,
      maxZoom: 20,
      durationMs: 1000,
      padding: { left: 0, right: 0, top: 0, bottom: 0 },
    });
    advance(0);
    advance(250);
    expect(transform.pitch).toBeGreaterThan(0);
    expect(transform.pitch).toBeLessThan(45);
    expect(transform.zoom).toBeGreaterThan(20);
    advance(1000);
    await flight.done;
    expect(transform.zoom).toBeCloseTo(20, 10);
    expect(transform.pitch).toBe(0);
    release();
  });

  it("cancels at the current view without a corrective end jump", async () => {
    const { map, transform, release } = setup();
    const flight = settleToPitch(map, 45, {
      fovDeg: 34 as Degrees,
      maxZoom: 22,
      durationMs: 1000,
      padding: { left: 0, right: 0, top: 0, bottom: 0 },
    });
    advance(250);
    const zoom = transform.zoom;
    const writes = vi.mocked(map.jumpTo).mock.calls.length;
    flight.cancel();
    await flight.done;
    advance(1000);
    expect(transform.zoom).toBe(zoom);
    expect(map.jumpTo).toHaveBeenCalledTimes(writes);
    expect(map.setCenterClampedToGround).not.toHaveBeenCalledWith(true);
    release();
  });

  it.each([0, 250])(
    "reverses a return to the physical image camera without recentering at height %s",
    async (height) => {
      const { map, transform, release } = setup({
        height,
        fov: 30,
        zoom: 18.5,
      });
      transform.setElevation(height);
      const target = MercatorCoordinate.fromLngLat(
        map.unproject([400, 300]),
        height
      );
      const initialEye = transform.getCameraLngLat();
      const altitude = transform.getCameraAltitude();
      const pose = {
        longitude: initialEye.lng,
        latitude: initialEye.lat,
        z: altitude,
        bearingDeg: transform.bearing,
        pitchDeg: transform.pitch,
        rollDeg: 0,
        direction: [0, 0, -1] as [number, number, number],
        up: [0, 1, 0] as [number, number, number],
        utmConvergenceRad: 0,
      };
      const unit = target.meterInMercatorCoordinateUnits();
      const right = new Vector3(
        Math.cos(transform.bearingInRadians),
        Math.sin(transform.bearingInRadians),
        0
      );
      const up = new Vector3(
        Math.sin(transform.bearingInRadians) *
          Math.cos(transform.pitchInRadians),
        -Math.cos(transform.bearingInRadians) *
          Math.cos(transform.pitchInRadians),
        Math.sin(transform.pitchInRadians)
      );
      const project = (offset = new Vector3()) => {
        const clip = new Vector3(
          (target.x + offset.x * unit) * transform.worldSize,
          (target.y + offset.y * unit) * transform.worldSize,
          height + offset.z
        ).applyMatrix4(
          new Matrix4().fromArray(transform.modelViewProjectionMatrix)
        );
        return new Vector3((clip.x + 1) * 400, (1 - clip.y) * 300, 0);
      };
      const baseline = [
        project(right).distanceTo(project()),
        project(up).distanceTo(project()),
      ];
      const back = settleToPitch(map, 45, {
        anchor: target,
        fovDeg: 50 as Degrees,
        padding: { left: 0, right: 0, top: 0, bottom: 0 },
        maxZoom: 30,
        durationMs: 1000,
        restoreGround: false,
      });
      advance(0);
      advance(1000);
      await back.done;
      vi.spyOn(performance, "now").mockReturnValue(1000);
      const forward = flyToPose(
        map,
        pose,
        altitude,
        { duration: 1000 },
        { dynamicDuration: false, anchor: target }
      );
      for (const time of [1000, 1100, 1250, 1500, 1750, 1900, 2000]) {
        advance(time);
        const centre = project();
        expect(centre.x).toBeCloseTo(400, 2);
        expect(centre.y).toBeCloseTo(300, 2);
        [
          project(right).distanceTo(centre),
          project(up).distanceTo(centre),
        ].forEach((scale, index) =>
          expect(scale / baseline[index]).toBeCloseTo(1, 5)
        );
      }
      await forward.done;
      expect(transform.getCameraLngLat().lng).toBeCloseTo(initialEye.lng, 7);
      expect(transform.getCameraLngLat().lat).toBeCloseTo(initialEye.lat, 7);
      expect(transform.getCameraAltitude()).toBeCloseTo(altitude, 4);
      expect(transform.fov).toBeCloseTo(30, 4);
      expect(Math.abs(transform.centerOffset.x)).toBeGreaterThan(
        transform.width
      );
      expect(map.setCenterClampedToGround).not.toHaveBeenCalledWith(true);
      release();
    }
  );

  it.each([
    {
      turn: 12,
      zoom: 18.5,
      fov: 30,
      padding: { left: 0, right: 0, top: 0, bottom: 0 },
    },
    {
      turn: 90,
      zoom: 21,
      fov: 8,
      padding: { left: 600, right: 0, top: 0, bottom: 300 },
    },
    {
      turn: -90,
      zoom: 21,
      fov: 8,
      padding: { left: 0, right: 600, top: 300, bottom: 0 },
    },
  ])(
    "keeps the panned viewport centre and scale during a $turn degree image turn",
    async ({ turn, zoom, fov, padding }) => {
      const { map, transform, release } = setup({
        fov,
        zoom,
        height: 250,
      });
      transform.setElevation(250);
      transform.setPadding(padding);
      const target = MercatorCoordinate.fromLngLat(
        map.unproject([400, 300]),
        250
      );
      const start = MercatorCoordinate.fromLngLat(transform.getCameraLngLat());
      const height = transform.getCameraAltitude();
      const project = (offset: Vector3) => {
        const unit = target.meterInMercatorCoordinateUnits();
        const p = new Vector3(
          (target.x + offset.x * unit) * transform.worldSize,
          (target.y + offset.y * unit) * transform.worldSize,
          250 + offset.z
        ).applyMatrix4(
          new Matrix4().fromArray(transform.modelViewProjectionMatrix)
        );
        return new Vector3((p.x + 1) * 400, (1 - p.y) * 300, 0);
      };
      const pixelScales = () => {
        const bearing = transform.bearingInRadians;
        const pitch = transform.pitchInRadians;
        const centre = project(new Vector3());
        return [
          project(
            new Vector3(Math.cos(bearing), Math.sin(bearing), 0)
          ).distanceTo(centre),
          project(
            new Vector3(
              Math.sin(bearing) * Math.cos(pitch),
              -Math.cos(bearing) * Math.cos(pitch),
              Math.sin(pitch)
            )
          ).distanceTo(centre),
        ];
      };
      const initialScales = pixelScales();
      const end = new MercatorCoordinate(
        start.x + 50 * target.meterInMercatorCoordinateUnits(),
        start.y - 30 * target.meterInMercatorCoordinateUnits()
      );
      const eye = end.toLngLat();
      const pose = {
        longitude: eye.lng,
        latitude: eye.lat,
        z: height + 100,
        bearingDeg: transform.bearing + turn,
        pitchDeg: 48,
        rollDeg: 0,
        direction: [0, 0, -1] as [number, number, number],
        up: [0, 1, 0] as [number, number, number],
        utmConvergenceRad: 0,
      };
      const flight = flyToPose(
        map,
        pose,
        height + 100,
        { duration: 1000 },
        { dynamicDuration: false, anchor: target }
      );
      let lastProgress = 0;
      for (const time of [0, 100, 250, 500, 750, 900, 1000]) {
        advance(time);
        const p = new Vector3(
          target.x * transform.worldSize,
          target.y * transform.worldSize,
          250
        ).applyMatrix4(
          new Matrix4().fromArray(transform.modelViewProjectionMatrix)
        );
        expect((p.x + 1) * 400).toBeCloseTo(400, 2);
        expect((1 - p.y) * 300).toBeCloseTo(300, 2);
        pixelScales().forEach((scale, index) =>
          expect(scale / initialScales[index]).toBeCloseTo(1, 5)
        );
        const actual = MercatorCoordinate.fromLngLat(
          transform.getCameraLngLat()
        );
        const progress = (actual.x - start.x) / (end.x - start.x);
        expect(progress).toBeGreaterThanOrEqual(lastProgress - 1e-6);
        expect(actual.y).toBeCloseTo(start.y + (end.y - start.y) * progress, 9);
        expect(transform.getCameraAltitude()).toBeCloseTo(
          height + 100 * progress,
          3
        );
        lastProgress = progress;
      }
      await flight.done;
      expect(transform.bearing).toBeCloseTo(
        ((pose.bearingDeg + 180) % 360) - 180,
        7
      );
      expect(transform.pitch).toBe(48);
      expect(transform.getCameraAltitude()).toBeCloseTo(height + 100, 4);
      release();
    }
  );

  it.each([
    {
      name: "fits the whole classic 12736x19136 portrait in a 1280x900 viewport",
      halfFovTan: 0.3,
      aspectRatio: 12736 / 19136,
      centerPreview: true,
      fitWholeImage: true,
      viewportWidth: 1280,
      viewportHeight: 900,
      roll: 0,
    },
    {
      name: "fits the whole rolled classic landscape in a 1280x900 viewport",
      halfFovTan: 0.3,
      aspectRatio: 19136 / 12736,
      centerPreview: true,
      fitWholeImage: true,
      viewportWidth: 1280,
      viewportHeight: 900,
    },
    {
      name: "fits a small landscape image on a single click",
      halfFovTan: 0.08,
      centerPreview: true,
    },
    {
      name: "fits a large landscape image on a single click",
      halfFovTan: 0.8,
      centerPreview: true,
    },
    {
      name: "preserves the viewport on a landscape double click",
      halfFovTan: 0.8,
      centerPreview: false,
    },
    {
      name: "fits a portrait image on a single click",
      halfFovTan: 0.08,
      aspectRatio: 0.625,
      centerPreview: true,
    },
    {
      name: "preserves the viewport on a portrait double click",
      halfFovTan: 0.8,
      aspectRatio: 0.625,
      centerPreview: false,
    },
    {
      name: "restores a panned and zoomed landscape image",
      halfFovTan: 0.25,
      centerPreview: false,
      restored: { panX: 0.17, panY: -0.23, zoom: 2.5 },
    },
    {
      name: "restores a panned and zoomed portrait image",
      halfFovTan: 0.25,
      aspectRatio: 0.625,
      centerPreview: false,
      restored: { panX: -0.31, panY: 0.22, zoom: 1.7 },
    },
    {
      name: "restores a zoomed-out centered image",
      halfFovTan: 0.25,
      centerPreview: false,
      restored: { panX: 0, panY: 0, zoom: 0.5 },
    },
    {
      name: "restores the same finite window in a wide viewport",
      halfFovTan: 0.25,
      centerPreview: false,
      viewportWidth: 1500,
      viewportHeight: 650,
      restored: { panX: 0.19, panY: -0.13, zoom: 1.13615176 },
    },
    {
      name: "restores the same finite window in a tall viewport",
      halfFovTan: 0.25,
      centerPreview: false,
      viewportWidth: 650,
      viewportHeight: 1100,
      restored: { panX: 0.19, panY: -0.13, zoom: 1.13615176 },
    },
    {
      name: "restores the same finite window in a narrow viewport",
      halfFovTan: 0.25,
      centerPreview: false,
      viewportWidth: 430,
      viewportHeight: 800,
      restored: { panX: 0.19, panY: -0.13, zoom: 1.13615176 },
    },
    {
      name: "restores the original viewport when double click interrupts a running single-click fit",
      halfFovTan: 0.8,
      centerPreview: false,
      interruptFit: true,
    },
  ])(
    "$name, including rolled principal-point offsets",
    async ({
      halfFovTan,
      aspectRatio = 1.6,
      centerPreview,
      fitWholeImage = false,
      roll = 0.37,
      restored,
      interruptFit = false,
      viewportWidth = 800,
      viewportHeight = 600,
    }) => {
      const { map, transform, release } = setup({
        fov: 30,
        zoom: 18.5,
        height: 250,
        viewportWidth,
        viewportHeight,
      });
      const centerX = viewportWidth / 2,
        centerY = viewportHeight / 2;
      transform.setElevation(250);
      transform.setPadding({ left: 600, right: 0, top: 0, bottom: 300 });
      const target = MercatorCoordinate.fromLngLat(
        map.unproject([centerX, centerY]),
        250
      );
      const startEye = MercatorCoordinate.fromLngLat(
        transform.getCameraLngLat()
      );
      const startAltitude =
        MercatorCoordinate.fromLngLat(
          transform.center,
          transform.getCameraAltitude()
        ).z / startEye.meterInMercatorCoordinateUnits();
      const unit = target.meterInMercatorCoordinateUnits();
      const destination = new MercatorCoordinate(
        startEye.x + 40 * unit,
        startEye.y - 25 * unit
      );
      const eye = destination.toLngLat();
      const pose = {
        longitude: eye.lng,
        latitude: eye.lat,
        z: startAltitude + 80,
        bearingDeg: transform.bearing + 18,
        pitchDeg: 48,
        rollDeg: 0,
        direction: [0, 0, -1] as [number, number, number],
        up: [0, 1, 0] as [number, number, number],
        utmConvergenceRad: 0,
      };
      const preview: PreviewImageGeometry = {
        aspectRatio: aspectRatio as Ratio,
        halfFovTan: halfFovTan as Ratio,
        principal: { xOffset: 0.18 as Ratio, yOffset: -0.11 as Ratio },
        roll: roll as Radians,
      };
      const project = (offset = new Vector3()) => {
        const clip = new Vector3(
          (target.x + offset.x * unit) * transform.worldSize,
          (target.y + offset.y * unit) * transform.worldSize,
          250 + offset.z
        ).applyMatrix4(
          new Matrix4().fromArray(transform.modelViewProjectionMatrix)
        );
        return new Vector3((clip.x + 1) * centerX, (1 - clip.y) * centerY, 0);
      };
      const read = () => {
        const bearing = transform.bearingInRadians,
          pitch = transform.pitchInRadians;
        const screen = project();
        return {
          screen,
          eye: MercatorCoordinate.fromLngLat(transform.getCameraLngLat()),
          altitude:
            MercatorCoordinate.fromLngLat(
              transform.center,
              transform.getCameraAltitude()
            ).z /
            MercatorCoordinate.fromLngLat(
              transform.getCameraLngLat()
            ).meterInMercatorCoordinateUnits(),
          scales: [
            project(
              new Vector3(Math.cos(bearing), Math.sin(bearing), 0)
            ).distanceTo(screen),
            project(
              new Vector3(
                Math.sin(bearing) * Math.cos(pitch),
                -Math.cos(bearing) * Math.cos(pitch),
                Math.sin(pitch)
              )
            ).distanceTo(screen),
          ],
        };
      };
      const previewState: ObliquePreviewState | undefined = restored
        ? {
            seriesId: "2026",
            imageId: "RI_29_3398",
            panX: restored.panX as Ratio,
            panY: restored.panY as Ratio,
            zoom: restored.zoom as Ratio,
          }
        : undefined;
      const original = read();
      const previewReferenceFrame = interruptFit
        ? transform.clone()
        : undefined;
      if (interruptFit) {
        const fit = flyToPose(
          map,
          pose,
          startAltitude + 80,
          { duration: 500 },
          {
            dynamicDuration: false,
            anchor: target,
            preview,
            centerPreview: true,
          }
        );
        advance(200);
        expect(read().scales[0] / original.scales[0]).not.toBeCloseTo(1, 2);
        fit.cancel();
        await fit.done;
      }
      const initial = read();
      const flight = flyToPose(
        map,
        pose,
        startAltitude + 80,
        { duration: 500, easingFunction: Easing.CUBIC_IN_OUT },
        {
          dynamicDuration: false,
          anchor: target,
          preview,
          centerPreview,
          fitWholeImage,
          previewState,
          previewReferenceFrame,
        }
      );
      const samples = [0, 50, 125, 250, 375, 450, 499, 500].map((time) => {
        advance(time);
        return read();
      });
      await flight.done;
      const final = samples.at(-1)!;
      for (const sample of samples) {
        const progress =
          (sample.eye.x - initial.eye.x) / (destination.x - initial.eye.x);
        expect(progress).toBeGreaterThanOrEqual(-1e-6);
        expect(progress).toBeLessThanOrEqual(1 + 1e-6);
        expect(sample.eye.y).toBeCloseTo(
          initial.eye.y + (destination.y - initial.eye.y) * progress,
          9
        );
        expect(sample.altitude).toBeCloseTo(
          initial.altitude + (startAltitude + 80 - initial.altitude) * progress,
          3
        );
        const expected = initial.screen.clone().lerp(final.screen, progress);
        expect(sample.screen.distanceTo(expected)).toBeLessThan(0.02);
        sample.scales.forEach((scale, index) =>
          expect(scale / initial.scales[index]).toBeCloseTo(
            Math.pow(final.scales[index] / initial.scales[index], progress),
            4
          )
        );
      }
      const longEdge =
        2 * transform.cameraToCenterDistance * preview.halfFovTan;
      const width = longEdge * Math.min(1, preview.aspectRatio),
        height = longEdge / Math.max(1, preview.aspectRatio);
      const centered = centerPreview || !!previewState;
      if (centered && !fitWholeImage) {
        expect(Math.min(width, height)).toBeCloseTo(
          Math.min(transform.width, transform.height) *
            (previewState?.zoom ?? 0.9),
          5
        );
      } else if (!centered) {
        final.scales.forEach((scale, index) =>
          expect(scale / original.scales[index]).toBeCloseTo(1, 4)
        );
      }
      const x = preview.principal.xOffset * width,
        y = preview.principal.yOffset * height;
      const imageCenter = new Vector3(
        transform.centerPoint.x +
          Math.cos(preview.roll) * x -
          Math.sin(preview.roll) * y,
        transform.centerPoint.y +
          Math.sin(preview.roll) * x +
          Math.cos(preview.roll) * y,
        0
      );
      if (centered) {
        expect(imageCenter.x).toBeCloseTo(
          centerX + (previewState?.panX ?? 0) * longEdge,
          5
        );
        expect(imageCenter.y).toBeCloseTo(
          centerY + (previewState?.panY ?? 0) * longEdge,
          5
        );
      } else {
        expect(final.screen.x).toBeCloseTo(centerX, 3);
        expect(final.screen.y).toBeCloseTo(centerY, 3);
        expect(
          imageCenter.distanceTo(new Vector3(centerX, centerY, 0))
        ).toBeGreaterThan(20);
      }
      if (fitWholeImage) {
        const rotation = new Matrix4().makeRotationZ(preview.roll);
        const corners = [
          [-width / 2, -height / 2],
          [width / 2, -height / 2],
          [width / 2, height / 2],
          [-width / 2, height / 2],
        ].map(([x, y]) =>
          new Vector3(x, y, 0).applyMatrix4(rotation).add(imageCenter)
        );
        for (const corner of corners) {
          expect(corner.x).toBeGreaterThanOrEqual(0.05 * viewportWidth - 1e-5);
          expect(corner.x).toBeLessThanOrEqual(0.95 * viewportWidth + 1e-5);
          expect(corner.y).toBeGreaterThanOrEqual(0.05 * viewportHeight - 1e-5);
          expect(corner.y).toBeLessThanOrEqual(0.95 * viewportHeight + 1e-5);
        }
        if (roll === 0) {
          expect(width).toBeCloseTo(539.0969899665552, 5);
          expect(height).toBeCloseTo(810, 5);
        }
      }
      const preceding = samples.at(-2)!;
      expect(final.screen.distanceTo(preceding.screen)).toBeLessThan(0.02);
      final.scales.forEach((scale, index) =>
        expect(scale / preceding.scales[index]).toBeCloseTo(1, 4)
      );
      expect(final.altitude).toBeCloseTo(startAltitude + 80, 4);
      expect(
        Math.hypot(final.eye.x - destination.x, final.eye.y - destination.y) /
          unit
      ).toBeLessThan(0.00001);
      const landedZ = MercatorCoordinate.fromLngLat(
        transform.center,
        transform.getCameraAltitude()
      ).z;
      const photoZ = MercatorCoordinate.fromLngLat(eye, startAltitude + 80).z;
      expect(Math.abs(landedZ - photoZ) / unit).toBeLessThan(0.00001);
      const writes = vi.mocked(map.jumpTo).mock.calls.length;
      advance(750);
      expect(map.jumpTo).toHaveBeenCalledTimes(writes);
      release();
    }
  );
  it("recenters a zoomed photo to its padded short edge before restoring the ordinary oblique camera", async () => {
    const { map, transform, release } = setup({
      height: 250,
      pitch: 51,
      fov: 2,
      zoom: 22,
    });
    const originalPadding = { top: 0, bottom: 0, left: 0, right: 0 };
    transform.setElevation(250);
    transform.setPadding({ left: 600, right: 0, top: 0, bottom: 300 });
    const eye = MercatorCoordinate.fromLngLat(transform.getCameraLngLat());
    const altitude =
      MercatorCoordinate.fromLngLat(
        transform.center,
        transform.getCameraAltitude()
      ).z / eye.meterInMercatorCoordinateUnits();
    const location = eye.toLngLat();
    const pose = {
      longitude: location.lng,
      latitude: location.lat,
      z: altitude,
      bearingDeg: transform.bearing,
      pitchDeg: transform.pitch,
      rollDeg: radToDegNumeric(0.37 as Radians),
      direction: [0, 0, -1] as [number, number, number],
      up: [0, 1, 0] as [number, number, number],
      utmConvergenceRad: 0,
    };
    const preview: PreviewImageGeometry = {
      aspectRatio: 1.6 as Ratio,
      halfFovTan: 0.3 as Ratio,
      principal: { xOffset: 0.18 as Ratio, yOffset: -0.11 as Ratio },
      roll: 0.37 as Radians,
    };
    const fit = flyToPose(
      map,
      pose,
      altitude,
      { duration: 500 },
      {
        anchor: MercatorCoordinate.fromLngLat(map.unproject([400, 300]), 250),
        preview,
        centerPreview: true,
        fitWholeImage: true,
        maxFovDeg: 110,
        dynamicDuration: false,
      }
    );
    for (const time of [0, 100, 250, 400, 500]) {
      advance(time);
      expect(transform.pitch).toBeCloseTo(51, 7);
      const actualEye = MercatorCoordinate.fromLngLat(
        transform.getCameraLngLat()
      );
      expect(actualEye.x).toBeCloseTo(eye.x, 10);
      expect(actualEye.y).toBeCloseTo(eye.y, 10);
    }
    await fit.done;
    const longEdge = 2 * transform.cameraToCenterDistance * preview.halfFovTan;
    const width = longEdge;
    const height = longEdge / preview.aspectRatio;
    const rotation = new Matrix4().makeRotationZ(preview.roll);
    for (const [x, y] of [
      [-width / 2, -height / 2],
      [width / 2, -height / 2],
      [width / 2, height / 2],
      [-width / 2, height / 2],
    ]) {
      const corner = new Vector3(x, y, 0).applyMatrix4(rotation);
      expect(Math.abs(corner.x)).toBeLessThanOrEqual(
        0.45 * transform.width + 1e-5
      );
      expect(Math.abs(corner.y)).toBeLessThanOrEqual(
        0.45 * transform.height + 1e-5
      );
    }
    const x = preview.principal.xOffset * width;
    const y = preview.principal.yOffset * height;
    expect(
      transform.centerOffset.x +
        Math.cos(preview.roll) * x -
        Math.sin(preview.roll) * y
    ).toBeCloseTo(0, 5);
    expect(
      transform.centerOffset.y +
        Math.sin(preview.roll) * x +
        Math.cos(preview.roll) * y
    ).toBeCloseTo(0, 5);
    vi.spyOn(performance, "now").mockReturnValue(500);
    const returning = settleToPitch(map, 45, {
      fovDeg: 34 as Degrees,
      padding: originalPadding,
      maxZoom: 22,
      durationMs: 500,
    });
    advance(500);
    expect(transform.pitch).toBeCloseTo(51, 7);
    advance(750);
    expect(transform.pitch).toBeLessThan(51);
    expect(transform.pitch).toBeGreaterThan(45);
    advance(1000);
    await returning.done;
    expect(transform.pitch).toBeCloseTo(45, 7);
    expect(transform.padding).toEqual(originalPadding);
    expect(transform.zoom).toBeLessThanOrEqual(22);
    release();
  });
});


describe("Cesium-compatible camera timing", () => {
  it("uses 100 ms per square-root metre, preserves immediate moves and caps long flights at 2 seconds", () => {
    expect(dynamicDurationMs(25)).toBe(500);
    expect(dynamicDurationMs(100)).toBe(1000);
    expect(dynamicDurationMs(10000)).toBe(2000);
    expect(dynamicDurationMs(100, 800)).toBe(800);
    expect(capObliqueAnimationDuration(0)).toBe(0);
    expect(capObliqueAnimationDuration(1800)).toBe(1800);
    expect(capObliqueAnimationDuration(3000)).toBe(2000);
  });

  it.each([0, 800])("honors configured easing for an anchored image flight lasting %i ms", async (duration) => {
    const { map, transform, release } = setup({ fov: 34, height: 250, zoom: 18 });
    const anchor = MercatorCoordinate.fromLngLat(map.unproject([400, 300]), 250);
    const eye = transform.getCameraLngLat();
    const progress = vi.fn();
    const flight = flyToPose(map, {
      longitude: eye.lng, latitude: eye.lat, z: 900,
      bearingDeg: transform.bearing + 90, pitchDeg: 42, rollDeg: 0,
      direction: [0, 0, -1], up: [0, 1, 0], utmConvergenceRad: 0,
    }, 900, { duration, easingFunction: Easing.QUADRATIC_IN }, {
      dynamicDuration: false, anchor, onProgress: progress,
    });
    if (duration) {
      advance(duration / 2);
      expect(progress).toHaveBeenLastCalledWith(0.25);
      advance(duration);
    } else {
      advance(1);
    }
    await flight.done;
    expect(progress).toHaveBeenLastCalledWith(1);
    release();
  });
});

describe("NG constant-distance anchored orbit", () => {
  it("forwards the orbit through flyToPose without changing the calibrated photo pose", async () => {
    const { map, transform, release } = setup({ fov: 34, height: 250, zoom: 18 });
    const anchor = MercatorCoordinate.fromLngLat(map.unproject([400, 300]), 250);
    const eye = MercatorCoordinate.fromLngLat(transform.getCameraLngLat());
    eye.z = MercatorCoordinate.fromLngLat(transform.center, transform.getCameraAltitude()).z;
    const distance = (point: MercatorCoordinate) => Math.hypot(point.x - anchor.x, point.y - anchor.y, point.z - anchor.z);
    const radius = distance(eye);
    const pose = {
      longitude: eye.toLngLat().lng + 0.01, latitude: eye.toLngLat().lat + 0.01, z: 1400,
      bearingDeg: transform.bearing + 90, pitchDeg: 55, rollDeg: 0,
      direction: [0, 0, -1] as [number, number, number],
      up: [0, 1, 0] as [number, number, number], utmConvergenceRad: 0,
    };
    const original = structuredClone(pose);
    const flight = flyToPose(map, pose, 1400, { duration: 500, easingFunction: Easing.LINEAR_NONE }, {
      anchor, orbitAroundAnchor: true, dynamicDuration: false, centerPreview: true,
      preview: { aspectRatio: 1.5 as Ratio, halfFovTan: 0.3 as Ratio,
        principal: { xOffset: 0.02 as Ratio, yOffset: -0.01 as Ratio }, roll: 0.1 as Radians },
    });
    let beforeCompletion: ReturnType<typeof transform.clone> | undefined;
    for (const time of [0, 250, 499.9999, 500]) {
      advance(time);
      if (time === 499.9999) beforeCompletion = transform.clone();
      const current = MercatorCoordinate.fromLngLat(transform.getCameraLngLat());
      current.z = MercatorCoordinate.fromLngLat(transform.center, transform.getCameraAltitude()).z;
      expect(distance(current)).toBeCloseTo(radius, 12);
      expect(transform.fov).toBeCloseTo(34, 7);
    }
    await flight.done;
    expect(beforeCompletion).toBeDefined();
    for (const side of ["left", "right", "top", "bottom"] as const) {
      expect(Math.abs(transform.padding[side] - beforeCompletion!.padding[side])).toBeLessThan(0.01);
    }
    expect(transform.center.lng).toBeCloseTo(beforeCompletion!.center.lng, 6);
    expect(transform.center.lat).toBeCloseTo(beforeCompletion!.center.lat, 6);
    expect(transform.zoom).toBeCloseTo(beforeCompletion!.zoom, 5);
    const groundSample = MercatorCoordinate.fromLngLat([7.2018669, 51.2732064]);
    const project = (frame: typeof transform) => new Vector3(groundSample.x * frame.worldSize, groundSample.y * frame.worldSize, 250)
      .applyMatrix4(new Matrix4().fromArray(frame.modelViewProjectionMatrix));
    expect(project(transform).distanceTo(project(beforeCompletion!))).toBeLessThan(0.00001);
    expect(pose).toEqual(original);
    release();
  });

  it.each([
    { fromBearing: 20, toBearing: 110, fromPitch: 45, toPitch: 45, panned: false, photo: true },
    { fromBearing: 350, toBearing: 10, fromPitch: 25, toPitch: 60, panned: false, photo: true },
    { fromBearing: 10, toBearing: 350, fromPitch: 60, toPitch: 30, panned: true, photo: true },
    { fromBearing: 325, toBearing: 55, fromPitch: 45, toPitch: 45, panned: true, photo: false },
  ])("keeps radius for $fromBearing→$toBearing, pitch $fromPitch→$toPitch (panned=$panned, photo=$photo)", async ({ fromBearing, toBearing, fromPitch, toPitch, panned, photo }) => {
    const { map, transform, release } = setup({ fov: 34, height: 250, zoom: 18, pitch: fromPitch });
    if (!panned) transform.setPadding({ left: 0, right: 0, top: 0, bottom: 0 });
    transform.setBearing(fromBearing);
    transform.setElevation(250);
    const anchor = MercatorCoordinate.fromLngLat(map.unproject([400, 300]), 250);
    const readEyeOffset = () => {
      const eye = MercatorCoordinate.fromLngLat(transform.getCameraLngLat());
      eye.z = MercatorCoordinate.fromLngLat(transform.center, transform.getCameraAltitude()).z;
      return new Vector3(eye.x - anchor.x, eye.z - anchor.z, eye.y - anchor.y)
        .divideScalar(anchor.meterInMercatorCoordinateUnits());
    };
    const initial = readEyeOffset();
    const radius = initial.length();
    const initialPolar = Math.acos(initial.y / radius);
    const initialAzimuth = Math.atan2(initial.x, initial.z);
    const bearingDelta = ((toBearing - fromBearing + 540) % 360) - 180;
    const physicalEye = transform.getCameraLngLat();
    const flight = settleToPitch(map, toPitch, {
      anchor,
      orbitAroundAnchor: true,
      restoreGround: !photo,
      bearingDeg: toBearing,
      fovDeg: 40 as Degrees,
      durationMs: 500,
      easing: Easing.LINEAR_NONE,
      camera: photo ? {
        pose: {
          longitude: physicalEye.lng + 0.01, latitude: physicalEye.lat + 0.01, z: 1400,
          bearingDeg: toBearing, pitchDeg: toPitch, rollDeg: 0,
          direction: [0, 0, -1], up: [0, 1, 0], utmConvergenceRad: 0,
        }, altitude: 1400,
      } : undefined,
    });
    let penultimateFov = transform.fov;
    for (const time of [0, 50, 125, 250, 375, 450, 499, 500]) {
      advance(time);
      expect(transform.fov).toBeCloseTo(34, 7);
      if (time === 499) penultimateFov = transform.fov;
      const progress = time / 500;
      const offset = readEyeOffset();
      expect(offset.length()).toBeCloseTo(radius, 4);
      const polar = initialPolar + degToRadNumeric(toPitch - fromPitch) * progress;
      const azimuth = initialAzimuth - degToRadNumeric(bearingDelta) * progress;
      const expected = new Vector3(
        radius * Math.sin(polar) * Math.sin(azimuth),
        radius * Math.cos(polar),
        radius * Math.sin(polar) * Math.cos(azimuth)
      );
      expect(offset.distanceTo(expected)).toBeLessThan(0.0001);
      expect(transform.pitch).toBeCloseTo(fromPitch + (toPitch - fromPitch) * progress, 7);
      expect(shortestAngleDelta(degToRadNumeric(fromBearing + bearingDelta * progress), degToRadNumeric(transform.bearing))).toBeCloseTo(0, 7);
      const clip = new Vector3(anchor.x * transform.worldSize, anchor.y * transform.worldSize, 250)
        .applyMatrix4(new Matrix4().fromArray(transform.modelViewProjectionMatrix));
      expect((clip.x + 1) * 400).toBeCloseTo(400, 4);
      expect((1 - clip.y) * 300).toBeCloseTo(300, 4);
    }
    await flight.done;
    expect(Math.abs(transform.fov - penultimateFov)).toBeLessThan(0.1);
    release();
  });
});
