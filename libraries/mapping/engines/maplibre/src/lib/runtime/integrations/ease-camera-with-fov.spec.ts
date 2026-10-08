import { describe, expect, it, vi } from "vitest";
import type { EaseToOptions, Map as MapLibreMap } from "maplibre-gl";
import { easeMapLibreCameraWithFov } from "./ease-camera-with-fov";

const fixture = () => {
  const listeners = new Map<string, Set<() => void>>();
  const previous = vi.fn(() => ({ zoom: 12 }));
  const map = {
    stop: vi.fn(),
    getVerticalFieldOfView: () => 40,
    setVerticalFieldOfView: vi.fn(),
    transformCameraUpdate:
      previous as unknown as MapLibreMap["transformCameraUpdate"],
    easeTo: vi.fn(),
    on: vi.fn((name: string, listener: () => void) => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name)!.add(listener);
    }),
    off: vi.fn((name: string, listener: () => void) =>
      listeners.get(name)?.delete(listener)
    ),
  };
  const native = map as unknown as MapLibreMap;
  const emit = (name: string) =>
    [...(listeners.get(name) ?? [])].forEach((listener) => listener());
  const frame = (progress: number) => {
    const options = map.easeTo.mock.calls[0][0] as EaseToOptions;
    options.easing!(progress);
    const transform = { setFov: vi.fn() };
    const result = map.transformCameraUpdate!.call(native, transform as never);
    return { transform, result };
  };
  return { map, native, previous, listeners, emit, frame };
};

describe("native camera flight with FOV", () => {
  it("uses a single native ease and changes FOV on its transform with the same easing", async () => {
    const f = fixture();
    const flight = easeMapLibreCameraWithFov(
      f.native,
      { duration: 800, pitch: 45, easing: (t) => t * t },
      60
    );
    expect(f.map.stop).toHaveBeenCalledOnce();
    expect(f.map.easeTo).toHaveBeenCalledOnce();
    expect(f.map.easeTo).toHaveBeenCalledWith(
      expect.objectContaining({ duration: 800, pitch: 45 })
    );
    const halfway = f.frame(0.5);
    expect(halfway.transform.setFov).toHaveBeenCalledWith(45);
    expect(halfway.result).toEqual({ zoom: 12 });
    expect(f.previous.mock.instances[0]).toBe(f.native);
    expect(f.frame(1).transform.setFov).toHaveBeenCalledWith(60);
    expect(f.map.setVerticalFieldOfView).not.toHaveBeenCalled();
    f.emit("moveend");
    await flight.done;
    expect(f.map.transformCameraUpdate).toBe(f.previous);
    expect(f.listeners.get("moveend")?.size).toBe(0);
    expect(f.listeners.get("remove")?.size).toBe(0);
  });

  it("allows a native zero-duration flight to finish synchronously", async () => {
    const f = fixture();
    f.map.easeTo.mockImplementation((options: EaseToOptions) => {
      const transform = { setFov: vi.fn() };
      f.map.transformCameraUpdate!.call(f.native, transform as never);
      expect(transform.setFov).toHaveBeenCalledWith(50);
      f.emit("moveend");
    });
    const flight = easeMapLibreCameraWithFov(f.native, { duration: 0 }, 50);
    await flight.done;
    expect(f.map.transformCameraUpdate).toBe(f.previous);
    flight.cancel();
    expect(f.map.stop).toHaveBeenCalledOnce();
  });

  it("cancels once and rejects stale frame mutation after cancellation", async () => {
    const f = fixture();
    const flight = easeMapLibreCameraWithFov(f.native, {}, 60);
    const staleUpdate = f.map.transformCameraUpdate!;
    flight.cancel();
    flight.cancel();
    await flight.done;
    const transform = { setFov: vi.fn() };
    staleUpdate.call(f.native, transform as never);
    expect(transform.setFov).not.toHaveBeenCalled();
    expect(f.map.stop).toHaveBeenCalledTimes(2);
    expect(f.map.transformCameraUpdate).toBe(f.previous);
  });

  it("does not replace a newer transform callback when the old flight completes", async () => {
    const f = fixture();
    const flight = easeMapLibreCameraWithFov(f.native, {}, 60);
    const replacement = vi.fn();
    f.map.transformCameraUpdate = replacement;
    f.emit("moveend");
    await flight.done;
    expect(f.map.transformCameraUpdate).toBe(replacement);
  });

  it("cleans up on map removal", async () => {
    const f = fixture();
    const flight = easeMapLibreCameraWithFov(f.native, {}, 60);
    f.emit("remove");
    await flight.done;
    expect(f.map.transformCameraUpdate).toBe(f.previous);
    expect(f.listeners.get("moveend")?.size).toBe(0);
  });

  it("restores the callback and event handlers if native ease throws", () => {
    const f = fixture();
    f.map.easeTo.mockImplementation(() => {
      throw new Error("native ease failed");
    });
    expect(() => easeMapLibreCameraWithFov(f.native, {}, 60)).toThrow(
      "native ease failed"
    );
    expect(f.map.transformCameraUpdate).toBe(f.previous);
    expect(f.listeners.get("moveend")?.size).toBe(0);
    expect(f.listeners.get("remove")?.size).toBe(0);
  });
});
