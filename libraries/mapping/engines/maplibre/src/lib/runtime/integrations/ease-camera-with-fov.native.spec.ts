// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Map as MapLibreMap } from "maplibre-gl";
import { Camera } from "maplibre-gl/src/ui/camera";
import { MercatorTransform } from "maplibre-gl/src/geo/projection/mercator_transform";
import { MercatorCameraHelper } from "maplibre-gl/src/geo/projection/mercator_camera_helper";
import { TaskQueue } from "maplibre-gl/src/util/task_queue";
import { setNow, restoreNow } from "maplibre-gl/src/util/time_control";
import { easeMapLibreCameraWithFov } from "./ease-camera-with-fov";

class NativeCamera extends Camera {
  queue = new TaskQueue();
  _requestRenderFrame(callback: () => void) {
    return this.queue.add(callback);
  }
  _cancelRenderFrame(id: number) {
    this.queue.remove(id);
  }
}
const setup = () => {
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  const transform = new MercatorTransform();
  transform.resize(512, 512);
  transform.setFov(40);
  const camera = new NativeCamera(transform, new MercatorCameraHelper(), {
    bearingSnap: 0,
    zoomSnap: 0,
  });
  const events: string[] = [];
  camera.on("movestart", () => events.push("start"));
  camera.on("moveend", () => events.push("end"));
  return { camera, events, map: camera as unknown as MapLibreMap };
};
afterEach(() => {
  restoreNow();
  vi.unstubAllGlobals();
});

describe("FOV on the installed MapLibre native camera", () => {
  it("copies the amended transform into the real camera with a single event lifecycle", async () => {
    const { camera, events, map } = setup();
    const setter = vi.spyOn(camera, "setVerticalFieldOfView");
    setNow(0);
    const flight = easeMapLibreCameraWithFov(
      map,
      { duration: 1000, pitch: 40, zoom: 3, easing: (t) => t },
      60
    );
    expect(events).toEqual(["start"]);
    setNow(500);
    camera.queue.run();
    expect(camera.getVerticalFieldOfView()).toBeCloseTo(50);
    expect(camera.getPitch()).toBeCloseTo(20);
    expect(events).toEqual(["start"]);
    setNow(1000);
    camera.queue.run();
    await flight.done;
    expect(camera.getVerticalFieldOfView()).toBeCloseTo(60);
    expect(events).toEqual(["start", "end"]);
    expect(setter).not.toHaveBeenCalled();
  });
  it.each([{ duration: 0 }, { duration: 800, animate: false }])(
    "applies final FOV when native easing is skipped: %j",
    async (options) => {
      const { camera, events, map } = setup();
      const flight = easeMapLibreCameraWithFov(
        map,
        { ...options, pitch: 35 },
        55
      );
      await flight.done;
      expect(camera.getVerticalFieldOfView()).toBeCloseTo(55);
      expect(camera.getPitch()).toBeCloseTo(35);
      expect(events).toEqual(["start", "end"]);
    }
  );
  it("keeps the actual intermediate FOV on cancellation", async () => {
    const { camera, events, map } = setup();
    setNow(0);
    const flight = easeMapLibreCameraWithFov(
      map,
      { duration: 1000, pitch: 40, easing: (t) => t },
      60
    );
    setNow(250);
    camera.queue.run();
    expect(camera.getVerticalFieldOfView()).toBeCloseTo(45);
    flight.cancel();
    await flight.done;
    setNow(1000);
    camera.queue.run();
    expect(camera.getVerticalFieldOfView()).toBeCloseTo(45);
    expect(events).toEqual(["start", "end"]);
  });
});
