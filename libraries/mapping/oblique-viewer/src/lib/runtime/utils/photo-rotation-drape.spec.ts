import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Matrix4, Texture } from "three";
import type { Map as MaplibreMap } from "maplibre-gl";
import type {
  ImageViewportHandle,
  ImageViewportSnapshot,
  ImageViewportSource,
  NativePreviewWindow,
} from "@carma-commons/image-pyramid";
import {
  createPhotoRotationDrape,
  type PhotoRotationDrape,
} from "./photo-rotation-drape";

type FakeHandle = ImageViewportHandle & {
  source: ImageViewportSource;
  window: NativePreviewWindow | null;
  publish: (state: ImageViewportSnapshot) => void;
  listeners: Set<(snapshot: ImageViewportSnapshot) => void>;
};
const fixtures = vi.hoisted(() => ({
  acquire: vi.fn(),
  scene: vi.fn(),
  runtimes: [] as unknown[],
  handles: [] as FakeHandle[],
  initial: new Map<string, "ready" | "pending" | "coarse" | "missing">(),
  releaseOrder: [] as string[],
  poolDispose: vi.fn(),
}));
vi.mock("@carma-commons/image-pyramid", () => ({
  ImageViewportPool: class {
    acquire(source: ImageViewportSource) {
      return fixtures.acquire(source);
    }
    dispose() {
      fixtures.poolDispose();
    }
  },
}));
vi.mock("@carma-mapping/engines/maplibre", () => ({
  acquireSharedThreeScene: () => fixtures.scene(),
  getSharedThreeSceneRuntimes: () => fixtures.runtimes,
}));
vi.mock("./oblique-viewport-source", () => ({
  viewportSourceOf: (photo: { record: { id: string } }) => ({
    id: photo.record.id,
    url: `https://imagery.example/${photo.record.id}.avif`,
    kind: "avif",
    nativeSize: { width: 16000, height: 12000 },
    maxSourceDensity: 0.5,
  }),
}));
vi.mock("../../core/utils/image-projection", async () => {
  const { Matrix4 } = await import("three");
  return {
    imageProjectionMatrix: () => new Matrix4(),
    sceneToPhotoEnu: () => new Matrix4(),
  };
});

const bitmap = (width: number, height: number) =>
  ({ width, height, close: vi.fn() } as unknown as ImageBitmap);
const snapshot = (
  handle: FakeHandle,
  ready: boolean,
  coarse = false
): ImageViewportSnapshot => {
  const window = handle.window!;
  const target = coarse ? { width: 64, height: 48 } : window.target;
  return {
    source: handle.source,
    bitmap: ready ? bitmap(target.width, target.height) : null,
    frame: ready ? { source: window.source, target } : null,
    requested: window,
    overview: null,
    loading: !ready,
    error: null,
    metrics: {} as ImageViewportSnapshot["metrics"],
  };
};
const photo = (id: string) =>
  ({ record: { id }, calibration: {}, dataset: {}, pose: {}, altitude: 500 } as
    Parameters<PhotoRotationDrape["prepare"]>[0]);
const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

let currentFrame: (() => void) | null;
let overlays: Map<string, { texture: Texture; opacity: number }>;
let sceneRelease: ReturnType<typeof vi.fn>;
let removeFrame: ReturnType<typeof vi.fn>;
let map: MaplibreMap;
const controllers: PhotoRotationDrape[] = [];
const controller = () => {
  const value = createPhotoRotationDrape(map);
  controllers.push(value);
  return value;
};

beforeEach(() => {
  vi.useFakeTimers();
  fixtures.handles.length = 0;
  fixtures.initial.clear();
  fixtures.releaseOrder.length = 0;
  fixtures.acquire.mockReset();
  fixtures.scene.mockReset();
  fixtures.poolDispose.mockReset();
  fixtures.runtimes = [{
    root: { visible: true, parent: null },
    mountsOnLocalFrame: true,
    providesTerrain: true,
    hasRenderableContent: () => true,
  }];
  currentFrame = null;
  overlays = new Map();
  sceneRelease = vi.fn();
  removeFrame = vi.fn(() => { currentFrame = null; });
  fixtures.scene.mockReturnValue({
    layer: {
      getLocalFrame: () => ({ sceneFromLocal: new Matrix4() }),
      projectSceneToLngLat: () => [7.2, 51.27],
      setMapStyleScreenOverlay: (id: string, value: { texture: Texture; opacity: number } | null) => {
        if (value) overlays.set(id, value);
        else overlays.delete(id);
      },
      addBeforeRenderCallback: (callback: () => void) => {
        currentFrame = callback;
        return removeFrame;
      },
    },
    release: sceneRelease,
  });
  map = {
    getCanvas: () => ({ width: 800, height: 600 }),
    triggerRepaint: vi.fn(() => { queueMicrotask(() => currentFrame?.()); }),
  } as unknown as MaplibreMap;
  fixtures.acquire.mockImplementation((source: ImageViewportSource) => {
    let value: ImageViewportSnapshot;
    const handle: FakeHandle = {
      source,
      window: null,
      listeners: new Set(),
      setViewport(window) {
        handle.window = window;
        const initial = fixtures.initial.get(source.id) ?? "ready";
        value = snapshot(handle, initial !== "pending", initial === "coarse");
        if (initial === "missing") value.error = "HTTP 404";
      },
      subscribe(listener) {
        handle.listeners.add(listener);
        listener(value);
        return () => {
          fixtures.releaseOrder.push(`unsubscribe:${source.id}`);
          handle.listeners.delete(listener);
        };
      },
      snapshot: () => value,
      publish(state) {
        value = state;
        for (const listener of handle.listeners) listener(value);
      },
      release: vi.fn(() => fixtures.releaseOrder.push(`release:${source.id}`)),
    };
    fixtures.handles.push(handle);
    return handle;
  });
});
afterEach(() => {
  for (const value of controllers.splice(0)) value.dispose();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("photo rotation drape lifecycle", () => {
  it("prepares only viewport-sized images and weights both fixed photo cameras with the flight progress", async () => {
    const drape = controller();
    const pending = drape.prepare(photo("from"), photo("to"));
    await flush();
    const transition = await pending;
    expect(transition).toBeDefined();
    expect(fixtures.handles).toHaveLength(2);
    for (const handle of fixtures.handles) {
      expect(handle.source.flipForTexture).toBe(true);
      expect(handle.window?.source).toEqual({ x: 0, y: 0, width: 16000, height: 12000 });
      expect(handle.window?.target).toEqual({ width: 800, height: 600 });
    }
    transition!.update(0.25);
    expect([...overlays.values()].map(value => value.opacity)).toEqual([0.75, 0.25]);
    transition!.update(1);
    expect([...overlays.values()].map(value => value.opacity)).toEqual([0, 1]);
  });

  it("disposes GPU textures before releasing the borrowed bitmap handles, without closing the bitmaps", async () => {
    const textures = vi.spyOn(Texture.prototype, "dispose").mockImplementation(function () {
      fixtures.releaseOrder.push("texture");
    });
    const drape = controller();
    const pending = drape.prepare(photo("from"), photo("to"));
    await flush();
    const transition = await pending;
    const borrowed = fixtures.handles.map(handle => handle.snapshot().bitmap!);
    transition!.dispose();
    expect(overlays.size).toBe(0);
    expect(textures).toHaveBeenCalledTimes(2);
    expect(fixtures.releaseOrder).toEqual([
      "unsubscribe:from", "texture", "release:from",
      "unsubscribe:to", "texture", "release:to",
    ]);
    for (const image of borrowed) expect(image.close).not.toHaveBeenCalled();
    drape.dispose();
    expect(removeFrame).toHaveBeenCalledTimes(1);
    expect(sceneRelease).toHaveBeenCalledTimes(1);
  });

  it("releases a prepared source when cancellation occurs while the destination is still loading", async () => {
    fixtures.initial.set("to", "pending");
    const drape = controller();
    const pending = drape.prepare(photo("from"), photo("to"));
    await flush();
    drape.cancel();
    await expect(pending).resolves.toBeUndefined();
    expect(overlays.size).toBe(0);
    for (const handle of fixtures.handles) {
      expect(handle.release).toHaveBeenCalledTimes(1);
      expect(handle.listeners.size).toBe(0);
    }
  });

  it("falls back without displaying a partial pair when the destination image is missing", async () => {
    fixtures.initial.set("to", "missing");
    const drape = controller();
    await expect(drape.prepare(photo("from"), photo("to"))).resolves.toBeUndefined();
    expect(overlays.size).toBe(0);
    for (const handle of fixtures.handles) expect(handle.release).toHaveBeenCalledTimes(1);
  });

  it("waits for the requested density rather than accepting a retained coarse bitmap during the compose deadline", async () => {
    fixtures.initial.set("to", "coarse");
    const drape = controller();
    let resolved = false;
    const pending = drape.prepare(photo("from"), photo("to")).then(value => { resolved = true; return value; });
    await flush();
    expect(resolved).toBe(false);
    const destination = fixtures.handles.find(handle => handle.source.id === "to")!;
    destination.publish(snapshot(destination, true));
    await flush();
    expect(await pending).toBeDefined();
  });

  it("releases the other image if source acquisition throws synchronously", async () => {
    const acquire = fixtures.acquire.getMockImplementation()!;
    fixtures.acquire.mockImplementation((source: ImageViewportSource) => {
      if (source.id === "to") throw Error("Source acquisition failed");
      return acquire(source);
    });
    const drape = controller();
    await expect(drape.prepare(photo("from"), photo("to"))).resolves.toBeUndefined();
    expect(fixtures.handles).toHaveLength(1);
    expect(fixtures.handles[0].release).toHaveBeenCalledTimes(1);
    expect(fixtures.handles[0].listeners.size).toBe(0);
    expect(overlays.size).toBe(0);
  });
});
