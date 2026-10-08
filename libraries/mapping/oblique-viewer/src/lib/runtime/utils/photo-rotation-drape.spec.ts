import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LinearFilter, Matrix3, Matrix4, SRGBColorSpace, Texture } from "three";
import type { Map as MaplibreMap } from "maplibre-gl";
import {
  createPhotoRotationDrape,
  type PhotoRotationDrape,
} from "./photo-rotation-drape";

const fixtures = vi.hoisted(() => ({
  peek: vi.fn(),
  acquire: vi.fn(),
  pool: vi.fn(),
  draw: vi.fn(),
  source: vi.fn(),
  scene: vi.fn(),
  projection: vi.fn(),
  enu: vi.fn(),
  runtimes: [] as unknown[],
}));
vi.mock("@carma-commons/image-pyramid", () => ({
  drawImageLevels: fixtures.draw,
  ImageLevelStackPool: fixtures.pool,
}));
vi.mock("./native-preview-pool", () => ({
  nativePixelPool: { peek: fixtures.peek, acquire: fixtures.acquire },
  nativePreviewSource: fixtures.source,
}));
vi.mock("@carma-mapping/engines/maplibre", () => ({
  acquireSharedThreeScene: () => fixtures.scene(),
  getSharedThreeSceneRuntimes: () => fixtures.runtimes,
}));
vi.mock("./oblique-viewport-source", () => ({
  originalOf: (photo: { record: { id: string } }) =>
    `https://original.example/${photo.record.id}.tif`,
  pyramidOf: (photo: { record: { id: string } }) =>
    `https://imagery.example/${photo.record.id}.avif`,
}));
vi.mock("../../core/utils/image-projection", () => ({
  imageProjectionMatrix: fixtures.projection,
  sceneToPhotoEnu: fixtures.enu,
}));

type Overlay = {
  texture: Texture;
  opacity: number;
  priority: number;
  showBasemapLabels: boolean;
  viewportToTexture: Matrix3;
  projective: { sceneToTexture: Matrix4 };
};
const photo = (id: string) =>
  ({
    record: { id, sourceId: `raw-${id}` },
    calibration: { widthPx: 16000, heightPx: 12000 },
    dataset: {
      previewPath: "https://imagery.example/",
      avifOnly: true,
      minimumPreviewQualityLevel: "1",
    },
    pose: { id, bearingDeg: 90 },
    altitude: 500,
  } as unknown as Parameters<PhotoRotationDrape["prepare"]>[0]);
const resident = () => {
  const state = new Set<() => void>();
  const content = new Set<() => void>();
  const pyramid = {
    native: { width: 16000, height: 12000 },
    levels: [{ level: 0, width: 16000, cols: 2, rows: 2 }],
  };
  return {
    pyramid,
    plan: {
      target: 0,
      visibleTarget: { level: 0, col0: 0, row0: 0, col1: 2, row1: 2 },
      layers: [0],
    },
    metrics: { decodedBytes: 1024 },
    visibleReady: true,
    error: null as string | null,
    ready: Promise.resolve(pyramid),
    setView: vi.fn(),
    isResident: vi.fn(() => true),
    subscribe: vi.fn((listener: () => void) => {
      state.add(listener);
      return () => state.delete(listener);
    }),
    onContentChange: vi.fn((listener: () => void) => {
      content.add(listener);
      return () => content.delete(listener);
    }),
    emitState: () => state.forEach((listener) => listener()),
    emitContent: () => content.forEach((listener) => listener()),
    listeners: () => state.size + content.size,
    borrowedBitmap: { close: vi.fn() },
    dispose: vi.fn(),
  };
};
type Resident = ReturnType<typeof resident>;
let stacks: Map<string, Resident>;
let releases: ReturnType<typeof vi.fn>[];
let overlays: Map<string, Overlay>;
let canvases: Array<{
  width: number;
  height: number;
  getContext: ReturnType<typeof vi.fn>;
}>;
let currentFrame: (() => void) | null;
let sceneRelease: ReturnType<typeof vi.fn>;
let removeFrame: ReturnType<typeof vi.fn>;
let layer: {
  getRenderer: ReturnType<typeof vi.fn>;
  getLocalFrame: ReturnType<typeof vi.fn>;
  projectSceneToLngLat: ReturnType<typeof vi.fn>;
  setMapStyleScreenOverlay?: (id: string, value: Overlay | null) => void;
  addBeforeRenderCallback?: (callback: () => void) => () => void;
};
let map: MaplibreMap;
let bearing: number;
let viewport: { width: number; height: number };
let contextAvailable: boolean;
const controllers: PhotoRotationDrape[] = [];
const controller = (
  options: Parameters<typeof createPhotoRotationDrape>[1] = {}
) => {
  const value = createPhotoRotationDrape(map, options);
  controllers.push(value);
  return value;
};
const values = () => [...overlays.values()];

beforeEach(() => {
  vi.useFakeTimers();
  for (const key of [
    "peek",
    "acquire",
    "pool",
    "draw",
    "source",
    "scene",
    "projection",
    "enu",
  ] as const)
    fixtures[key].mockReset();
  releases = [];
  stacks = new Map([
    ["raw-from", resident()],
    ["raw-to", resident()],
  ]);
  overlays = new Map();
  canvases = [];
  currentFrame = null;
  contextAvailable = true;
  viewport = { width: 800, height: 600 };
  bearing = 0;
  fixtures.peek.mockImplementation((source) => stacks.get(source.id));
  fixtures.source.mockImplementation((input) => ({
    id: input.imageId,
    url: input.avifPyramidUrl,
  }));
  fixtures.acquire.mockImplementation((source) => {
    const stack = stacks.get(source.id);
    if (!stack) throw new Error("Unavailable source");
    const release = vi.fn();
    releases.push(release);
    return { stack, release };
  });
  fixtures.pool.mockImplementation(() => {
    throw Error("Unexpected private pool");
  });
  fixtures.enu.mockImplementation(() => new Matrix4().makeTranslation(3, 4, 5));
  fixtures.projection.mockImplementation((record) =>
    new Matrix4().makeTranslation(record.id === "from" ? 1 : 2, 0, 0)
  );
  fixtures.runtimes = [
    {
      root: { visible: true, parent: null },
      mountsOnLocalFrame: true,
      providesTerrain: true,
      hasRenderableContent: () => true,
    },
  ];
  sceneRelease = vi.fn();
  removeFrame = vi.fn(() => {
    currentFrame = null;
  });
  layer = {
    getRenderer: vi.fn(() => ({ capabilities: { maxTextureSize: 16384 } })),
    getLocalFrame: vi.fn(() => ({ sceneFromLocal: new Matrix4() })),
    projectSceneToLngLat: vi.fn(() => [7.2, 51.27]),
    setMapStyleScreenOverlay: (id, value) => {
      if (value) overlays.set(id, value);
      else overlays.delete(id);
    },
    addBeforeRenderCallback: (callback) => {
      currentFrame = callback;
      return removeFrame;
    },
  };
  fixtures.scene.mockReturnValue({ layer, release: sceneRelease });
  map = {
    getCanvas: () => viewport,
    getBearing: () => bearing,
    triggerRepaint: vi.fn(),
  } as unknown as MaplibreMap;
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw Error("Unexpected request");
    })
  );
  vi.stubGlobal(
    "OffscreenCanvas",
    class {
      getContext = vi.fn(() =>
        contextAvailable ? { clearRect: vi.fn() } : null
      );
      constructor(public width: number, public height: number) {
        canvases.push(this);
      }
    }
  );
});
afterEach(() => {
  for (const value of controllers.splice(0)) value.dispose();
  releases.forEach((release) => expect(release).toHaveBeenCalledTimes(1));
  stacks.forEach((stack) => expect(stack.listeners()).toBe(0));
  expect(fixtures.pool).not.toHaveBeenCalled();
  expect(globalThis.fetch).not.toHaveBeenCalled();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("prepared photo rotation drape", () => {
  it("retains shared leases, doubles buffer dimensions and leaves the source view untouched", async () => {
    const from = photo("from"),
      to = photo("to");
    const transition = await controller().prepare(from, to);
    expect(transition?.targetImageId).toBe("to");
    expect(vi.getTimerCount()).toBe(0);
    expect(fixtures.peek).toHaveBeenCalledTimes(1);
    expect(fixtures.acquire).toHaveBeenCalledTimes(2);
    expect(stacks.get("raw-from")!.setView).not.toHaveBeenCalled();
    expect(stacks.get("raw-to")!.setView).toHaveBeenCalledWith(
      { visible: { x: 0, y: 0, width: 16000, height: 12000 }, density: 0.1 },
      1600 * 1200
    );
    expect(fixtures.source).toHaveBeenCalledWith(
      expect.objectContaining({
        imageId: "raw-from",
        sourceUrl: "https://original.example/from.tif",
        avifPyramidUrl: "https://imagery.example/from.avif",
        avifOnly: true,
        minimumQualityLevel: "1",
        nativeSize: { width: 16000, height: 12000 },
      })
    );
    expect(canvases.map((c) => [c.width, c.height])).toEqual([
      [1600, 1200],
      [1600, 1200],
    ]);
    expect(fixtures.draw).toHaveBeenCalledWith(
      expect.anything(),
      stacks.get("raw-from"),
      { originX: 0, originY: 0, scale: 0.1 },
      canvases[0]
    );
    expect(values().map((v) => v.opacity)).toEqual([1, 0]);
    transition!.update(1);
    expect(values().map((v) => v.opacity)).toEqual([1, 0]);
    bearing = 44.9;
    transition!.update(1);
    expect(values().map((v) => v.opacity)).toEqual([1, 0]);
    bearing = 45;
    transition!.update(0);
    expect(values().map((v) => v.opacity)).toEqual([0, 1]);
    transition!.update(-1);
    expect(values().map((v) => v.opacity)).toEqual([0, 1]);
  });

  it.each([
    [0, 180, -89.9, -90],
    [180, 0, 90.1, 90],
    [170, -170, 179.9, 180],
    [-170, 170, -179.9, -180],
    [350, 10, 359.9, 0],
    [10, 350, 0.1, 0],
  ])(
    "cuts at half the shortest heading change from %s to %s",
    async (start, end, before, half) => {
      bearing = start;
      const target = photo("to");
      const transition = await controller().prepare(photo("from"), {
        ...target,
        pose: { ...target.pose, bearingDeg: end },
      });
      bearing = before;
      transition!.update(1);
      expect(values().map((value) => value.opacity)).toEqual([1, 0]);
      bearing = half;
      currentFrame?.();
      expect(values().map((value) => value.opacity)).toEqual([0, 1]);
      transition!.update(0);
      expect(values().map((value) => value.opacity)).toEqual([0, 1]);
      bearing = end;
      currentFrame?.();
      expect(values().map((value) => value.opacity)).toEqual([0, 1]);
    }
  );

  it("keeps the source for equal headings until finish and ignores elapsed progress", async () => {
    bearing = 90;
    const transition = await controller().prepare(photo("from"), photo("to"));
    transition!.update(1);
    bearing = 170;
    currentFrame?.();
    expect(values().map((value) => value.opacity)).toEqual([1, 0]);
    transition!.finish();
    expect(values().map((value) => value.opacity)).toEqual([0, 1]);
  });

  it("captures the start heading after target preparation and ignores opposite movement", async () => {
    const target = stacks.get("raw-to")!;
    target.visibleReady = false;
    const pending = controller().prepare(photo("from"), photo("to"));
    bearing = 30;
    target.visibleReady = true;
    target.emitState();
    const transition = await pending;
    bearing = -20;
    transition!.update(1);
    expect(values().map((value) => value.opacity)).toEqual([1, 0]);
    bearing = 59.9;
    currentFrame?.();
    expect(values().map((value) => value.opacity)).toEqual([1, 0]);
    bearing = 60;
    currentFrame?.();
    expect(values().map((value) => value.opacity)).toEqual([0, 1]);
  });

  it("can blend a complete target without a resident source", async () => {
    stacks.delete("raw-from");
    const transition = await controller().prepare(photo("from"), photo("to"));
    expect(transition).toBeDefined();
    expect(values()).toHaveLength(1);
    transition!.update(0.25);
    expect(values()[0].opacity).toBe(0);
    bearing = 45;
    currentFrame?.();
    expect(values()[0].opacity).toBe(1);
    expect(values()[0].priority).toBe(101);
  });

  it("continues navigation without a drape when target acquisition fails", async () => {
    stacks.delete("raw-to");
    await expect(
      controller().prepare(photo("from"), photo("to"))
    ).resolves.toBeUndefined();
    expect(canvases).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("waits for complete whole-photo target coverage, not a partial tile or cropped ready view", async () => {
    const target = stacks.get("raw-to")!;
    target.isResident.mockImplementation(() => false);
    const resolved = vi.fn();
    const pending = controller()
      .prepare(photo("from"), photo("to"))
      .then(resolved);
    await Promise.resolve();
    currentFrame?.();
    expect(resolved).not.toHaveBeenCalled();
    expect(overlays.size).toBe(0);
    expect(fixtures.draw).not.toHaveBeenCalled();
    target.isResident.mockReturnValue(true);
    target.plan.visibleTarget.col1 = 1;
    target.emitState();
    await Promise.resolve();
    expect(resolved).not.toHaveBeenCalled();
    target.plan.visibleTarget.col1 = 2;
    target.emitState();
    await pending;
    expect(resolved.mock.calls[0][0]?.targetImageId).toBe("to");
    expect(overlays.size).toBe(2);
    expect(fixtures.projection).toHaveBeenCalledTimes(2);
    expect(stacks.get("raw-from")!.setView).not.toHaveBeenCalled();
  });

  it("revalidates target residency between readiness and the asynchronous handoff", async () => {
    const target = stacks.get("raw-to")!;
    const pending = controller().prepare(photo("from"), photo("to"));
    target.isResident.mockReturnValue(false);
    await expect(pending).resolves.toBeUndefined();
    expect(fixtures.draw).not.toHaveBeenCalled();
    expect(overlays.size).toBe(0);
  });

  it("waits beyond five seconds and releases preparation after the bounded load timeout", async () => {
    stacks.get("raw-to")!.visibleReady = false;
    const resolved = vi.fn();
    const pending = controller()
      .prepare(photo("from"), photo("to"))
      .then(resolved);
    await vi.advanceTimersByTimeAsync(29999);
    expect(resolved).not.toHaveBeenCalled();
    expect(overlays.size).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(resolved).toHaveBeenCalledWith(undefined);
    expect(vi.getTimerCount()).toBe(0);
    releases.forEach((release) => expect(release).toHaveBeenCalledOnce());
  });

  it("releases pending work immediately on a target network failure", async () => {
    const target = stacks.get("raw-to")!;
    target.visibleReady = false;
    const pending = controller().prepare(photo("from"), photo("to"));
    target.error = "HTTP 404";
    target.emitState();
    await expect(pending).resolves.toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
    expect(target.listeners()).toBe(0);
  });

  it("handles rejected asynchronous image metadata without hanging", async () => {
    const target = stacks.get("raw-to")!;
    target.visibleReady = false;
    target.ready = Promise.reject(new Error("Invalid image header"));
    await expect(
      controller().prepare(photo("from"), photo("to"))
    ).resolves.toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["cancel", "dispose"] as const)(
    "settles pending preparation and ignores late content on %s",
    async (method) => {
      const target = stacks.get("raw-to")!;
      target.visibleReady = false;
      const drape = controller();
      const pending = drape.prepare(photo("from"), photo("to"));
      drape[method]();
      await expect(pending).resolves.toBeUndefined();
      target.visibleReady = true;
      target.emitState();
      target.emitContent();
      await Promise.resolve();
      expect(overlays.size).toBe(0);
      expect(fixtures.draw).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    }
  );

  it("supersedes pending generations without a late target replacing the new pair", async () => {
    const target = stacks.get("raw-to")!;
    target.visibleReady = false;
    const drape = controller();
    const old = drape.prepare(photo("from"), photo("to"));
    target.visibleReady = true;
    const next = drape.prepare(photo("from"), photo("to"));
    await expect(old).resolves.toBeUndefined();
    const transition = await next;
    transition!.update(0.4);
    target.emitState();
    expect(values().map((value) => value.opacity)).toEqual([1, 0]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("coalesces decoded pixel updates per render and reuses the existing textures", async () => {
    const transition = await controller().prepare(photo("from"), photo("to"));
    const textures = values().map((value) => value.texture);
    const versions = textures.map((texture) => texture.version);
    const target = stacks.get("raw-to")!;
    target.emitState();
    currentFrame?.();
    expect(fixtures.draw).toHaveBeenCalledTimes(2);
    target.emitContent();
    target.emitContent();
    target.emitContent();
    transition!.update(0.5);
    expect(fixtures.draw).toHaveBeenCalledTimes(2);
    currentFrame?.();
    expect(fixtures.draw).toHaveBeenCalledTimes(3);
    expect(values().map((value) => value.texture)).toEqual(textures);
    expect(textures.map((texture) => texture.version)).toEqual([
      versions[0],
      versions[1] + 1,
    ]);
    currentFrame?.();
    currentFrame?.();
    expect(fixtures.draw).toHaveBeenCalledTimes(3);
    stacks.get("raw-from")!.emitContent();
    currentFrame?.();
    expect(fixtures.draw).toHaveBeenCalledTimes(4);
  });

  it.each(["raw-from", "raw-to"])(
    "retains %s texture when a shared view evicts its full base",
    async (id) => {
      await controller().prepare(photo("from"), photo("to"));
      const target = stacks.get(id)!;
      target.isResident.mockReturnValue(false);
      target.emitContent();
      currentFrame?.();
      expect(fixtures.draw).toHaveBeenCalledTimes(2);
      target.isResident.mockReturnValue(true);
      target.emitContent();
      currentFrame?.();
      expect(fixtures.draw).toHaveBeenCalledTimes(3);
    }
  );

  it("respects the renderer's maximum texture edge", async () => {
    viewport = { width: 4000, height: 3000 };
    layer.getRenderer.mockReturnValue({
      capabilities: { maxTextureSize: 1024 },
    });
    await controller().prepare(photo("from"), photo("to"));
    expect(canvases.map((canvas) => [canvas.width, canvas.height])).toEqual([
      [1024, 768],
      [1024, 768],
    ]);
  });

  it("uses top-down canvas pixels with texture flipY and no mipmaps", async () => {
    await controller().prepare(photo("from"), photo("to"));
    values().forEach((value, index) => {
      expect(value.texture.image).toBe(canvases[index]);
      expect(value.texture.flipY).toBe(true);
      expect(value.texture.colorSpace).toBe(SRGBColorSpace);
      expect(value.texture.minFilter).toBe(LinearFilter);
      expect(value.texture.magFilter).toBe(LinearFilter);
      expect(value.texture.generateMipmaps).toBe(false);
      expect(value.texture.version).toBeGreaterThan(0);
      expect(value.viewportToTexture.equals(new Matrix3())).toBe(true);
    });
  });

  it("bounds both canvas allocations even for an exceptionally large viewport", async () => {
    viewport = { width: 20000, height: 20000 };
    await controller().prepare(photo("from"), photo("to"));
    expect(canvases).toHaveLength(2);
    expect(
      canvases.reduce((sum, c) => sum + c.width * c.height * 16, 0)
    ).toBeLessThanOrEqual(512 * 1024 * 1024);
    canvases.forEach((c) => {
      expect(c.width).toBeLessThanOrEqual(16000);
      expect(c.height).toBeLessThanOrEqual(12000);
    });
  });

  it("registers fixed photo cameras in the scene frame and reprojects only when its origin or frame changes", async () => {
    const source = photo("from"),
      target = photo("to");
    const from = {
      ...source,
      record: {
        ...source.record,
        centerWGS84: [7.19, 51.26, 480] as [number, number, number],
      },
      calibration: { ...source.calibration, focalLengthMm: 80 },
      pose: {
        ...source.pose,
        longitude: 7.19,
        latitude: 51.26,
        z: 480,
        bearingDeg: 15,
        pitchDeg: 40,
        rollDeg: -8,
      },
      altitude: 435,
    };
    const to = {
      ...target,
      record: {
        ...target.record,
        centerWGS84: [7.24, 51.29, 610] as [number, number, number],
      },
      calibration: { ...target.calibration, focalLengthMm: 100 },
      pose: {
        ...target.pose,
        longitude: 7.24,
        latitude: 51.29,
        z: 610,
        bearingDeg: 125,
        pitchDeg: 55,
        rollDeg: 12,
      },
      altitude: 565,
    };
    const frame = new Matrix4().makeTranslation(10, 20, 30);
    // Distinct ENU results make cross-wiring either photo observable at every rebase.
    const enuResults = [1, 2, 3, 4, 5, 6].map((n) =>
      new Matrix4().makeTranslation(n, n * 10, n * 100)
    );
    let nextEnu = 0;
    fixtures.enu.mockImplementation(() => enuResults[nextEnu++]);
    fixtures.projection.mockImplementation(
      (_record, _calibration, _pose, enu: Matrix4) => enu.clone()
    );
    const expectOwnPhotoProjectors = (
      offset: number,
      origin: number[],
      sceneFrame: Matrix4
    ) => {
      [from, to].forEach((image, slot) => {
        expect(fixtures.enu).toHaveBeenNthCalledWith(
          offset + slot + 1,
          origin,
          sceneFrame,
          image.pose,
          image.altitude
        );
        expect(fixtures.projection).toHaveBeenNthCalledWith(
          offset + slot + 1,
          image.record,
          image.calibration,
          image.pose,
          enuResults[offset + slot]
        );
        expect(values()[slot].projective.sceneToTexture.elements).toEqual(
          enuResults[offset + slot].elements
        );
      });
    };
    bearing = from.pose.bearingDeg;
    layer.getLocalFrame.mockReturnValue({ sceneFromLocal: frame });
    const transition = await controller().prepare(from, to);
    expectOwnPhotoProjectors(0, [7.2, 51.27], frame);
    const projectors = values().map((value) => value.projective.sceneToTexture);
    const fixedMatrices = projectors.map((matrix) => matrix.elements.slice());
    const textures = values().map((value) => value.texture);
    for (const heading of [30, 60, 70, 95, 125]) {
      bearing = heading;
      transition!.update(0.95);
      stacks.get("raw-from")!.emitContent();
      stacks.get("raw-to")!.emitContent();
      currentFrame?.();
      expect(values().map((value) => value.projective.sceneToTexture)).toEqual(
        projectors
      );
      expect(projectors.map((matrix) => matrix.elements)).toEqual(
        fixedMatrices
      );
      expect(values().map((value) => value.texture)).toEqual(textures);
      expect(fixtures.enu).toHaveBeenCalledTimes(2);
      expect(fixtures.projection).toHaveBeenCalledTimes(2);
    }
    expect(fixtures.draw).toHaveBeenCalledTimes(12);
    layer.projectSceneToLngLat.mockReturnValue([7.21, 51.28]);
    currentFrame?.();
    expect(fixtures.enu).toHaveBeenCalledTimes(4);
    expect(fixtures.projection).toHaveBeenCalledTimes(4);
    expectOwnPhotoProjectors(2, [7.21, 51.28], frame);
    const rebasedFrame = new Matrix4().makeTranslation(11, 20, 30);
    layer.getLocalFrame.mockReturnValue({ sceneFromLocal: rebasedFrame });
    currentFrame?.();
    expect(fixtures.enu).toHaveBeenCalledTimes(6);
    expect(fixtures.projection).toHaveBeenCalledTimes(6);
    expectOwnPhotoProjectors(4, [7.21, 51.28], rebasedFrame);
    expect(fixtures.draw).toHaveBeenCalledTimes(12);
  });

  it("honours the current label setting while keeping independent photo projections", async () => {
    let labels = false;
    await controller({ showBasemapLabels: () => labels }).prepare(
      photo("from"),
      photo("to")
    );
    expect(values().every((v) => !v.showBasemapLabels)).toBe(true);
    labels = true;
    currentFrame?.();
    expect(values().every((v) => v.showBasemapLabels)).toBe(true);
    expect(values()[0].projective.sceneToTexture).not.toBe(
      values()[1].projective.sceneToTexture
    );
  });

  it("skips invisible parents and non-renderable terrain", async () => {
    fixtures.runtimes = [
      {
        root: { visible: true, parent: { visible: false } },
        mountsOnLocalFrame: true,
        providesTerrain: true,
      },
    ];
    await expect(
      controller().prepare(photo("from"), photo("to"))
    ).resolves.toBeUndefined();
    fixtures.runtimes = [
      {
        root: { visible: true },
        mountsOnLocalFrame: true,
        providesTerrain: true,
        hasRenderableContent: () => false,
      },
    ];
    await expect(
      controller().prepare(photo("from"), photo("to"))
    ).resolves.toBeUndefined();
    expect(fixtures.peek).not.toHaveBeenCalled();
  });

  it("does not require a mesh-specific provider beyond visible renderable terrain", async () => {
    expect(
      await controller().prepare(photo("from"), photo("to"))
    ).toBeDefined();
  });

  it("shrinks owned canvases and disposes textures without disposing borrowed resident content", async () => {
    const textures = vi.spyOn(Texture.prototype, "dispose");
    const drape = controller(),
      transition = await drape.prepare(photo("from"), photo("to"));
    transition!.dispose();
    transition!.dispose();
    drape.dispose();
    drape.dispose();
    expect(overlays.size).toBe(0);
    expect(textures).toHaveBeenCalledTimes(2);
    expect(canvases.map((c) => [c.width, c.height])).toEqual([
      [1, 1],
      [1, 1],
    ]);
    stacks.forEach((stack) => {
      expect(stack.borrowedBitmap.close).not.toHaveBeenCalled();
      expect(stack.dispose).not.toHaveBeenCalled();
    });
    expect(removeFrame).toHaveBeenCalledTimes(1);
    expect(sceneRelease).toHaveBeenCalledTimes(1);
  });

  it("releases the final overlay after the handover delay and cancels that timer on disposal", async () => {
    const drape = controller(),
      transition = await drape.prepare(photo("from"), photo("to"));
    transition!.finish();
    transition!.finish();
    expect(vi.getTimerCount()).toBe(1);
    expect(values().map((v) => v.opacity)).toEqual([0, 1]);
    await vi.advanceTimersByTimeAsync(749);
    expect(overlays.size).toBe(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(overlays.size).toBe(0);
    const second = await drape.prepare(photo("from"), photo("to"));
    second!.finish();
    second!.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("ignores old transition callbacks after a new pair replaces it", async () => {
    const drape = controller(),
      old = await drape.prepare(photo("from"), photo("to"));
    const next = await drape.prepare(photo("from"), photo("to"));
    next!.update(0.4);
    old!.update(1);
    old!.finish();
    old!.dispose();
    expect(values().map((v) => v.opacity)).toEqual([1, 0]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("preserves the other slot if snapshotting one photo throws", async () => {
    fixtures.draw.mockImplementationOnce(() => {
      throw Error("Detached resident bitmap");
    });
    const transition = await controller().prepare(photo("from"), photo("to"));
    expect(transition).toBeDefined();
    expect(values()).toHaveLength(1);
    expect(values()[0].priority).toBe(101);
    expect(canvases[0].width).toBe(1);
  });

  it("releases canvas allocation if no 2d context is available", async () => {
    contextAvailable = false;
    await expect(
      controller().prepare(photo("from"), photo("to"))
    ).resolves.toBeUndefined();
    expect(canvases.every((c) => c.width === 1 && c.height === 1)).toBe(true);
  });

  it("reuses all four visited directions after stack parking without another full-photo view or wait", async () => {
    const drape = controller();
    const directions = ["north", "east", "south", "west"];
    const textures = new Map<string, Texture>();
    let previous = "from";
    for (const direction of directions) {
      stacks.set(`raw-${direction}`, resident());
      const transition = await drape.prepare(photo(previous), photo(direction));
      expect(transition).toBeDefined();
      textures.set(
        direction,
        values().find((value) => value.priority === 101)!.texture
      );
      transition!.dispose();
      previous = direction;
    }
    stacks.forEach((stack) => {
      stack.metrics.decodedBytes = 0;
      stack.visibleReady = false;
      stack.isResident.mockReturnValue(false);
      stack.setView.mockClear();
    });
    const draws = fixtures.draw.mock.calls.length;
    for (const direction of directions) {
      const transition = await drape.prepare(photo(previous), photo(direction));
      expect(transition).toBeDefined();
      expect(values().find((value) => value.priority === 100)!.texture).toBe(
        textures.get(previous)
      );
      expect(values().find((value) => value.priority === 101)!.texture).toBe(
        textures.get(direction)
      );
      expect(stacks.get(`raw-${direction}`)!.setView).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
      transition!.dispose();
      previous = direction;
    }
    expect(fixtures.draw).toHaveBeenCalledTimes(draws);
  });

  it("bounds four cached RGBA canvas/GPU pairs and evicts the oldest fifth view", async () => {
    viewport = { width: 20000, height: 20000 };
    const drape = controller();
    let previous = "from";
    let first: Texture | undefined;
    for (const direction of ["north", "east", "south", "west", "fifth"]) {
      stacks.set(`raw-${direction}`, resident());
      const transition = await drape.prepare(photo(previous), photo(direction));
      first ??= values().find((value) => value.priority === 101)!.texture;
      transition!.dispose();
      const retained = canvases.filter((canvas) => canvas.width > 1);
      expect(retained.length).toBeLessThanOrEqual(4);
      expect(
        retained.reduce(
          (bytes, canvas) => bytes + canvas.width * canvas.height * 8,
          0
        )
      ).toBeLessThanOrEqual(512 * 1024 * 1024);
      previous = direction;
    }
    expect(first!.image.width).toBe(1);
    drape.dispose();
    expect(canvases.every((canvas) => canvas.width === 1)).toBe(true);
  });

  it("reuses pixels while rebuilding each cached target projector from its current own pose", async () => {
    const drape = controller();
    (await drape.prepare(photo("from"), photo("to")))!.dispose();
    const target = photo("to");
    const changed = {
      ...target,
      pose: { ...target.pose, longitude: 7.3, latitude: 51.3, bearingDeg: 120 },
      altitude: 725,
    };
    const transition = await drape.prepare(photo("from"), changed);
    expect(transition).toBeDefined();
    expect(fixtures.enu).toHaveBeenLastCalledWith(
      [7.2, 51.27],
      expect.any(Matrix4),
      changed.pose,
      725
    );
    expect(fixtures.projection).toHaveBeenLastCalledWith(
      changed.record,
      changed.calibration,
      changed.pose,
      expect.any(Matrix4)
    );
  });

  it("requires a fresh complete target when a larger viewport exceeds the cached resolution", async () => {
    const drape = controller();
    (await drape.prepare(photo("from"), photo("to")))!.dispose();
    viewport = { width: 1600, height: 1200 };
    const target = stacks.get("raw-to")!;
    target.visibleReady = false;
    const resolved = vi.fn();
    const pending = drape.prepare(photo("from"), photo("to")).then(resolved);
    await Promise.resolve();
    expect(resolved).not.toHaveBeenCalled();
    expect(target.setView).toHaveBeenCalledTimes(2);
    drape.cancel();
    await pending;
    expect(resolved).toHaveBeenCalledWith(undefined);
  });

  it("invalidates a retained snapshot if a later canvas refresh fails", async () => {
    const drape = controller();
    await drape.prepare(photo("from"), photo("to"));
    const target = stacks.get("raw-to")!;
    fixtures.draw.mockImplementationOnce(() => {
      throw new Error("Detached bitmap");
    });
    target.emitContent();
    currentFrame?.();
    expect(overlays.size).toBe(0);
    target.visibleReady = false;
    const resolved = vi.fn();
    const pending = drape.prepare(photo("from"), photo("to")).then(resolved);
    await Promise.resolve();
    expect(resolved).not.toHaveBeenCalled();
    drape.cancel();
    await pending;
    expect(resolved).toHaveBeenCalledWith(undefined);
  });

  it("does not prepare after disposal or for an unchanged photo", async () => {
    const drape = controller();
    await expect(
      drape.prepare(photo("from"), photo("from"))
    ).resolves.toBeUndefined();
    drape.dispose();
    await expect(
      drape.prepare(photo("from"), photo("to"))
    ).resolves.toBeUndefined();
    expect(fixtures.peek).not.toHaveBeenCalled();
  });
});
