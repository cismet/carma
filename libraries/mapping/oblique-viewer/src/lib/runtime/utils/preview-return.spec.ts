import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LngLat,
  MercatorCoordinate,
  type Map as MaplibreMap,
  type PaddingOptions,
} from "maplibre-gl";
import { MercatorTransform } from "maplibre-gl/src/geo/projection/mercator_transform";
import { Matrix4, Plane, Ray, Vector3 } from "three";
import type { Degrees } from "@carma-units";

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

const setup = ({ zoom = 25.4, height = 0, pitch = 45, fov = 0.1 } = {}) => {
  const transform = new MercatorTransform({ maxZoom: 30, maxPitch: 85 });
  transform.resize(800, 600);
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
      advance(250);
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

  it("tracks the centre while changing image heading and pitch on a straight camera path", async () => {
    const { map, transform, release } = setup({
      fov: 30,
      zoom: 18.5,
      height: 250,
    });
    transform.setElevation(250);
    transform.setPadding({ left: 0, right: 0, top: 0, bottom: 0 });
    const target = MercatorCoordinate.fromLngLat(
      map.unproject([400, 300]),
      250
    );
    const start = MercatorCoordinate.fromLngLat(transform.getCameraLngLat());
    const height = transform.getCameraAltitude();
    const end = new MercatorCoordinate(
      start.x + 50 * target.meterInMercatorCoordinateUnits(),
      start.y - 30 * target.meterInMercatorCoordinateUnits()
    );
    const eye = end.toLngLat();
    const pose = {
      longitude: eye.lng,
      latitude: eye.lat,
      z: height + 100,
      bearingDeg: transform.bearing + 12,
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
      const actual = MercatorCoordinate.fromLngLat(transform.getCameraLngLat());
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
  });
});
