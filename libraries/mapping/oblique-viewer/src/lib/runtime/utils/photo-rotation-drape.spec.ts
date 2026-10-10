import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LinearFilter,
  Matrix3,
  Matrix4,
  SRGBColorSpace,
  Texture,
  Vector3,
} from "three";
import type { ImageView } from "@carma-commons/image-pyramid";
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
  tileRange: vi.fn(),
  source: vi.fn(),
  scene: vi.fn(),
  projection: vi.fn(),
  enu: vi.fn(),
  runtimes: [] as unknown[],
}));
vi.mock("@carma-commons/image-pyramid", () => ({
  drawImageLevels: fixtures.draw,
  tileRangeFor: fixtures.tileRange,
  imageTileRect: (
    level: {
      width: number;
      height: number;
      tileWidth: number;
      tileHeight: number;
    },
    native: { width: number; height: number },
    col: number,
    row: number
  ) => ({
    x: (col * level.tileWidth * native.width) / level.width,
    y: (row * level.tileHeight * native.height) / level.height,
    width:
      (Math.min(level.tileWidth, level.width - col * level.tileWidth) *
        native.width) /
      level.width,
    height:
      (Math.min(level.tileHeight, level.height - row * level.tileHeight) *
        native.height) /
      level.height,
  }),
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
  projective: {
    sceneToTexture: Matrix4;
    sourceProjection: Matrix4;
    frame?: {
      opacity: number;
      width: number;
      feather: number;
      featherOpacity: number;
    };
  };
  backdropLook?: { contrast: number; brightness: number; saturation: number };
  backdropTint?: readonly number[];
  backdropOpacity?: number;
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
    levels: [
      {
        level: 0,
        width: 16000,
        height: 12000,
        tileWidth: 8000,
        tileHeight: 6000,
        cols: 2,
        rows: 2,
      },
    ],
  };
  const isResident = vi.fn(() => true);
  let bitmap = { width: 8000, height: 6000 };
  return {
    pyramid,
    tile: vi.fn((_level: number, _col: number, _row: number) =>
      isResident() ? bitmap : undefined
    ),
    replaceBitmap: () => {
      bitmap = { width: 8000, height: 6000 };
    },
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
    isResident,
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
    "tileRange",
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
  fixtures.tileRange.mockReturnValue({ col0: 0, row0: 0, col1: 1, row1: 1 });
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
  it("retains shared leases at displayed physical resolution and leaves the source view untouched", async () => {
    const from = photo("from"),
      to = photo("to");
    const transition = await controller().prepare(from, to);
    expect(transition?.targetImageId).toBe("to");
    expect(vi.getTimerCount()).toBe(0);
    expect(fixtures.peek).toHaveBeenCalledTimes(1);
    expect(fixtures.acquire).toHaveBeenCalledTimes(2);
    expect(stacks.get("raw-from")!.setView).not.toHaveBeenCalled();
    expect(stacks.get("raw-to")!.setView).toHaveBeenCalledWith(
      { visible: { x: 0, y: 0, width: 16000, height: 12000 }, density: 0.05 },
      800 * 600
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
      [800, 600],
      [800, 600],
    ]);
    expect(fixtures.draw).toHaveBeenCalledWith(
      expect.anything(),
      stacks.get("raw-from"),
      { originX: 0, originY: 0, scale: 0.05 },
      canvases[0]
    );
    expect(values().map((v) => v.opacity)).toEqual([1, 0]);
    transition!.update(1);
    currentFrame?.();
    expect(values().map((v) => v.opacity)).toEqual([1, 0]);
    bearing = 22.5;
    transition!.update(1);
    currentFrame?.();
    expect(values().map((v) => v.opacity)).toEqual([0.75, 0.25]);
    bearing = 45;
    transition!.update(0);
    currentFrame?.();
    expect(values().map((v) => v.opacity)).toEqual([0.5, 0.5]);
    transition!.update(-1);
    currentFrame?.();
    expect(values().map((v) => v.opacity)).toEqual([0.5, 0.5]);
  });

  it.each([
    [0, 180, -89.9, -90],
    [180, 0, 90.1, 90],
    [170, -170, 179.9, 180],
    [-170, 170, -179.9, -180],
    [350, 10, 359.9, 0],
    [10, 350, 0.1, 0],
  ])(
    "linearly mixes the shortest actual heading change from %s to %s",
    async (start, end, before, half) => {
      bearing = start;
      const target = photo("to");
      const transition = await controller().prepare(photo("from"), {
        ...target,
        pose: { ...target.pose, bearingDeg: end },
      });
      bearing = before;
      transition!.update(1);
      currentFrame?.();
      expect(values()[1].opacity).toBeGreaterThan(0.49);
      expect(values()[1].opacity).toBeLessThan(0.5);
      bearing = half;
      currentFrame?.();
      expect(values()[0].opacity).toBeCloseTo(0.5);
      expect(values()[1].opacity).toBeCloseTo(0.5);
      transition!.update(0);
      currentFrame?.();
      expect(values()[1].opacity).toBeCloseTo(0.5);
      bearing = end;
      currentFrame?.();
      expect(values().map((value) => value.opacity)).toEqual([0, 1]);
    }
  );

  it("uses the source-only fallback for equal headings and ignores elapsed progress", async () => {
    bearing = 90;
    const transition = await controller().prepare(photo("from"), photo("to"));
    transition!.update(1);
    currentFrame?.();
    bearing = 170;
    currentFrame?.();
    expect(values().map((value) => value.opacity)).toEqual([1]);
    transition!.finish();
    expect(values().map((value) => value.opacity)).toEqual([1]);
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
    currentFrame?.();
    expect(values().map((value) => value.opacity)).toEqual([1, 0]);
    bearing = 45;
    currentFrame?.();
    expect(values()[1].opacity).toBeCloseTo(0.25);
    bearing = 60;
    currentFrame?.();
    expect(values()[1].opacity).toBeCloseTo(0.5);
  });

  it("can blend a complete target without a resident source", async () => {
    stacks.delete("raw-from");
    const transition = await controller().prepare(photo("from"), photo("to"));
    expect(transition).toBeDefined();
    expect(values()).toHaveLength(1);
    transition!.update(0.25);
    currentFrame?.();
    expect(values()[0].opacity).toBe(0);
    bearing = 45;
    currentFrame?.();
    expect(values()[0].opacity).toBeCloseTo(0.5);
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
    currentFrame?.();
    target.emitState();
    expect(values().map((value) => value.opacity)).toEqual([1, 0]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("defers coalesced pixel refinements until travel finishes and never draws from beforeRender", async () => {
    const transition = await controller().prepare(photo("from"), photo("to"), {
      retainUntilReveal: true,
    });
    const textures = values().map((value) => value.texture);
    const target = stacks.get("raw-to")!;
    const source = stacks.get("raw-from")!;
    const scans = target.tile.mock.calls.length;
    target.replaceBitmap();
    source.replaceBitmap();
    target.emitContent();
    target.emitContent();
    source.emitContent();
    transition!.update(0.5);
    currentFrame?.();
    await vi.advanceTimersByTimeAsync(1000);
    expect(fixtures.draw).toHaveBeenCalledTimes(2);
    expect(target.tile).toHaveBeenCalledTimes(scans);
    transition!.finish();
    currentFrame?.();
    expect(fixtures.draw).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(32);
    expect(fixtures.draw).toHaveBeenCalledTimes(3);
    expect(fixtures.draw.mock.calls[2][1]).toBe(target);
    await vi.advanceTimersByTimeAsync(32);
    expect(fixtures.draw).toHaveBeenCalledTimes(4);
    expect(values().map((value) => value.texture)).toEqual(textures);
    target.emitState();
    target.emitContent();
    currentFrame?.();
    await vi.advanceTimersByTimeAsync(32);
    expect(fixtures.draw).toHaveBeenCalledTimes(4);
  });

  it.each(["raw-from", "raw-to"])(
    "retains %s texture through eviction and unchanged restored pixels",
    async (id) => {
      const transition = await controller().prepare(
        photo("from"),
        photo("to"),
        { retainUntilReveal: true }
      );
      transition!.finish();
      const target = stacks.get(id)!;
      target.isResident.mockReturnValue(false);
      target.emitContent();
      currentFrame?.();
      await vi.advanceTimersByTimeAsync(32);
      expect(fixtures.draw).toHaveBeenCalledTimes(2);
      target.isResident.mockReturnValue(true);
      target.emitContent();
      await vi.advanceTimersByTimeAsync(32);
      expect(fixtures.draw).toHaveBeenCalledTimes(2);
      target.replaceBitmap();
      target.emitContent();
      await vi.advanceTimersByTimeAsync(32);
      expect(fixtures.draw).toHaveBeenCalledTimes(3);
    }
  );

  it("publishes only once at render after multiple progress callbacks", async () => {
    const transition = await controller().prepare(photo("from"), photo("to"));
    const publish = vi.spyOn(layer, "setMapStyleScreenOverlay");
    bearing = 45;
    transition!.update(0.1);
    transition!.update(0.4);
    transition!.update(0.5);
    expect(publish).not.toHaveBeenCalled();
    currentFrame?.();
    expect(publish).toHaveBeenCalledTimes(2);
    expect(values().map((value) => value.opacity)).toEqual([0.5, 0.5]);
    transition!.finish();
    expect(publish).toHaveBeenCalledTimes(4);
  });

  it.each(["cancel", "dispose"] as const)(
    "cancels queued refinement on %s without painting released pixels",
    async (method) => {
      const drape = controller();
      const transition = await drape.prepare(photo("from"), photo("to"), {
        retainUntilReveal: true,
      });
      stacks.get("raw-to")!.replaceBitmap();
      stacks.get("raw-to")!.emitContent();
      transition!.finish();
      expect(vi.getTimerCount()).toBe(1);
      drape[method]();
      await vi.advanceTimersByTimeAsync(1000);
      expect(fixtures.draw).toHaveBeenCalledTimes(2);
      expect(vi.getTimerCount()).toBe(0);
      expect(overlays.size).toBe(0);
    }
  );

  it("keeps finer partial ROI pixels when a later content event only evicts them", async () => {
    const target = stacks.get("raw-to")!;
    target.pyramid.levels.push({
      level: 1,
      width: 8000,
      height: 6000,
      tileWidth: 8000,
      tileHeight: 6000,
      cols: 1,
      rows: 1,
    });
    target.plan = {
      target: 1,
      visibleTarget: { level: 1, col0: 0, row0: 0, col1: 1, row1: 1 },
      layers: [1],
    };
    const coarse = { width: 8000, height: 6000 };
    const fine = { width: 8000, height: 6000 };
    let fineAvailable = false;
    target.tile.mockImplementation((level) =>
      level === 1 ? coarse : fineAvailable ? fine : undefined
    );
    const transition = await controller().prepare(photo("from"), photo("to"), {
      retainUntilReveal: true,
    });
    const texture = values()[1].texture;
    const initialVersion = texture.version;
    transition!.finish();
    target.plan.layers = [1, 0];
    fineAvailable = true;
    target.emitContent();
    await vi.advanceTimersByTimeAsync(32);
    expect(fixtures.draw).toHaveBeenCalledTimes(3);
    expect(texture.version).toBe(initialVersion + 1);
    fineAvailable = false;
    target.emitContent();
    await vi.advanceTimersByTimeAsync(32);
    expect(fixtures.draw).toHaveBeenCalledTimes(3);
    expect(texture.version).toBe(initialVersion + 1);
    expect(values()[1].texture).toBe(texture);
  });

  it("cancels idle refinement and ignores its late callback after replacement", async () => {
    const idleCallbacks: (() => void)[] = [];
    vi.stubGlobal("requestIdleCallback", (callback: () => void) => {
      idleCallbacks.push(callback);
      return idleCallbacks.length;
    });
    const cancelIdle = vi.fn();
    vi.stubGlobal("cancelIdleCallback", cancelIdle);
    const drape = controller();
    const old = await drape.prepare(photo("from"), photo("to"), {
      retainUntilReveal: true,
    });
    stacks.get("raw-to")!.replaceBitmap();
    stacks.get("raw-to")!.emitContent();
    old!.finish();
    expect(idleCallbacks).toHaveLength(1);
    const replacement = await drape.prepare(photo("from"), photo("to"), {
      retainUntilReveal: true,
    });
    expect(cancelIdle).toHaveBeenCalledWith(1);
    stacks.get("raw-to")!.replaceBitmap();
    stacks.get("raw-to")!.emitContent();
    replacement!.finish();
    expect(idleCallbacks).toHaveLength(2);
    const before = fixtures.draw.mock.calls.length;
    idleCallbacks[0]();
    expect(fixtures.draw).toHaveBeenCalledTimes(before);
    drape.dispose();
    expect(cancelIdle).toHaveBeenCalledWith(2);
    idleCallbacks[1]();
    expect(fixtures.draw).toHaveBeenCalledTimes(before);
    expect(overlays.size).toBe(0);
  });

  it("waits for camera motion to settle before refining retained pixels", async () => {
    let moving = true;
    Object.assign(map, { isMoving: () => moving });
    const transition = await controller().prepare(photo("from"), photo("to"), {
      retainUntilReveal: true,
    });
    stacks.get("raw-to")!.replaceBitmap();
    stacks.get("raw-to")!.emitContent();
    transition!.finish();
    await vi.advanceTimersByTimeAsync(300);
    expect(fixtures.draw).toHaveBeenCalledTimes(2);
    moving = false;
    await vi.advanceTimersByTimeAsync(100);
    expect(fixtures.draw).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
  });

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
      currentFrame?.();
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
    expect(fixtures.draw).toHaveBeenCalledTimes(2);
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
    expect(fixtures.draw).toHaveBeenCalledTimes(2);
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
    currentFrame?.();
    old!.update(1);
    currentFrame?.();
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
    const transition = await drape.prepare(photo("from"), photo("to"), {
      retainUntilReveal: true,
    });
    transition!.finish();
    const target = stacks.get("raw-to")!;
    target.replaceBitmap();
    fixtures.draw.mockImplementationOnce(() => {
      throw new Error("Detached bitmap");
    });
    target.emitContent();
    currentFrame?.();
    await vi.advanceTimersByTimeAsync(32);
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

  it("uses a single retained source for unchanged photos and does not prepare after disposal", async () => {
    const drape = controller();
    expect(await drape.prepare(photo("from"), photo("from"))).toBeDefined();
    expect(values()).toHaveLength(1);
    expect(fixtures.acquire).toHaveBeenCalledTimes(1);
    const peeks = fixtures.peek.mock.calls.length;
    drape.dispose();
    await expect(
      drape.prepare(photo("from"), photo("to"))
    ).resolves.toBeUndefined();
    expect(fixtures.peek).toHaveBeenCalledTimes(peeks);
  });
});

describe("source-only seamless drape", () => {
  it("retains the same photo when fitting or flying back to its capture pose", async () => {
    const transition = await controller().prepare(
      photo("from"),
      photo("from"),
      { sourceOnly: true }
    );
    expect(transition?.targetImageId).toBe("from");
    for (const progress of [0, 0.25, 0.5, 1]) {
      transition!.update(progress);
      currentFrame?.();
      expect(values().map((overlay) => overlay.opacity)).toEqual([1]);
    }
    transition!.finish();
    await vi.advanceTimersByTimeAsync(60000);
    expect(values().map((overlay) => overlay.opacity)).toEqual([1]);
    transition!.dispose();
    expect(overlays.size).toBe(0);
  });

  it("projects only the original source and never opens or replans the target", async () => {
    const drape = controller();
    const from = { ...photo("from"), altitude: 730 };
    const to = { ...photo("to"), altitude: 1450 };
    stacks.delete("raw-to");
    const transition = await drape.prepare(from, to, { sourceOnly: true });
    expect(transition?.targetImageId).toBe("to");
    // The opaque source must stay below the incoming flat photo's fade.
    expect(values()[0].projective?.underlay).toBe(true);
    expect(fixtures.acquire.mock.calls.map(([source]) => source.id)).toEqual([
      "raw-from",
    ]);
    expect(
      fixtures.source.mock.calls.every(
        ([input]) => input.imageId === "raw-from"
      )
    ).toBe(true);
    expect(stacks.get("raw-from")!.setView).not.toHaveBeenCalled();
    expect(fixtures.projection).toHaveBeenCalledWith(
      from.record,
      from.calibration,
      from.pose,
      expect.any(Matrix4)
    );
    expect(fixtures.enu).toHaveBeenCalledWith(
      [7.2, 51.27],
      expect.any(Matrix4),
      from.pose,
      730
    );
    expect(canvases).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
    for (const heading of [0, 45, 90, 180, -90]) {
      bearing = heading;
      transition!.update(1);
      currentFrame?.();
      currentFrame!();
      expect([...overlays.keys()].every((id) => id.endsWith("-from"))).toBe(
        true
      );
      expect(values().map((overlay) => overlay.opacity)).toEqual([1]);
    }
    expect(fixtures.projection).toHaveBeenCalledTimes(1);
  });

  it("holds the source after flight completion until explicit target-flat readiness disposal", async () => {
    const transition = await controller().prepare(photo("from"), photo("to"), {
      sourceOnly: true,
    });
    const stack = stacks.get("raw-from")!;
    transition!.finish();
    await vi.advanceTimersByTimeAsync(60000);
    expect(values().map((overlay) => overlay.opacity)).toEqual([1]);
    expect(releases[0]).not.toHaveBeenCalled();
    const draws = fixtures.draw.mock.calls.length;
    stack.replaceBitmap();
    stack.emitContent();
    currentFrame!();
    await vi.advanceTimersByTimeAsync(32);
    expect(fixtures.draw).toHaveBeenCalledTimes(draws + 1);
    transition!.dispose();
    expect(overlays.size).toBe(0);
    expect(stack.listeners()).toBe(0);
    expect(releases[0]).toHaveBeenCalledOnce();
    stack.emitContent();
    currentFrame!();
    expect(fixtures.draw).toHaveBeenCalledTimes(draws + 1);
  });

  it("reuses a complete cached outgoing photo even after its shared decoded stack was parked", async () => {
    const drape = controller();
    await drape.prepare(photo("to"), photo("from"));
    const cachedTexture = [...overlays.entries()].find(([id]) =>
      id.endsWith("-to")
    )![1].texture;
    drape.cancel();
    stacks.get("raw-from")!.metrics.decodedBytes = 0;
    fixtures.acquire.mockClear();
    fixtures.draw.mockClear();
    const sourceView = stacks.get("raw-from")!.setView;
    sourceView.mockClear();
    const allocated = canvases.length;
    await drape.prepare(photo("from"), photo("to"), { sourceOnly: true });
    expect(values()[0].texture).toBe(cachedTexture);
    expect(canvases).toHaveLength(allocated);
    expect(fixtures.draw).not.toHaveBeenCalled();
    expect(sourceView).not.toHaveBeenCalled();
    expect(fixtures.acquire).not.toHaveBeenCalled();
  });

  it("reuses cached source and target canvases after native-stack eviction without blocking forecasts", async () => {
    const drape = controller();
    (await drape.prepare(photo("from"), photo("to")))!.dispose();
    (await drape.prepare(photo("to"), photo("from")))!.dispose();
    const allocated = canvases.length;
    stacks.clear();
    fixtures.acquire.mockClear();
    fixtures.draw.mockClear();
    const releaseCount = releases.length;
    const transition = await drape.prepare(photo("from"), photo("to"));
    expect(transition).toBeDefined();
    expect(fixtures.acquire).not.toHaveBeenCalled();
    expect(releases).toHaveLength(releaseCount);
    expect(canvases).toHaveLength(allocated);
    currentFrame!();
    transition!.finish();
    expect(values()).toHaveLength(2);
    expect(fixtures.draw).not.toHaveBeenCalled();
    transition!.dispose();
    expect(values()).toHaveLength(0);
    const sourceOnly = await drape.prepare(photo("from"), photo("to"), {
      sourceOnly: true,
    });
    expect(sourceOnly).toBeDefined();
    expect(fixtures.acquire).not.toHaveBeenCalled();
    expect(values()).toHaveLength(1);
    sourceOnly!.dispose();
  });

  it("supersedes an in-flight two-photo preparation without retaining its target subscription", async () => {
    const drape = controller();
    const target = stacks.get("raw-to")!;
    target.visibleReady = false;
    const pending = drape.prepare(photo("from"), photo("to"));
    const transition = await drape.prepare(photo("from"), photo("to"), {
      sourceOnly: true,
    });
    await expect(pending).resolves.toBeUndefined();
    expect(transition).toBeDefined();
    expect(target.listeners()).toBe(0);
    target.visibleReady = true;
    target.emitState();
    expect(values().map((overlay) => overlay.opacity)).toEqual([1]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not substitute a target projection when outgoing pixels are unavailable", async () => {
    stacks.delete("raw-from");
    await expect(
      controller().prepare(photo("from"), photo("to"), { sourceOnly: true })
    ).resolves.toBeUndefined();
    expect(fixtures.acquire).not.toHaveBeenCalled();
    expect(overlays.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("refuses partial source pixels without replacing their shared view", async () => {
    const source = stacks.get("raw-from")!;
    source.isResident.mockReturnValue(false);
    await expect(
      controller().prepare(photo("from"), photo("to"), { sourceOnly: true })
    ).resolves.toBeUndefined();
    expect(source.setView).not.toHaveBeenCalled();
    expect(fixtures.acquire).not.toHaveBeenCalled();
    expect(overlays.size).toBe(0);
  });

  it("does not promise a mandatory source projection without a scene coordinate frame", async () => {
    const drape = controller();
    layer.getLocalFrame.mockReturnValue(null);
    await expect(
      drape.prepare(photo("from"), photo("to"), { sourceOnly: true })
    ).resolves.toBeUndefined();
    layer.getLocalFrame.mockReturnValue({ sceneFromLocal: new Matrix4() });
    layer.projectSceneToLngLat.mockReturnValue(null);
    await expect(
      drape.prepare(photo("from"), photo("to"), { sourceOnly: true })
    ).resolves.toBeUndefined();
    expect(fixtures.acquire).not.toHaveBeenCalled();
    expect(overlays.size).toBe(0);
  });

  it("requires a confirmed renderable receiver instead of forcing hidden mesh work", async () => {
    fixtures.runtimes = [
      {
        root: { visible: true, parent: null },
        mountsOnLocalFrame: true,
        providesTerrain: true,
      },
    ];
    await expect(
      controller().prepare(photo("from"), photo("to"), { sourceOnly: true })
    ).resolves.toBeUndefined();
    expect(fixtures.acquire).not.toHaveBeenCalled();
    expect(overlays.size).toBe(0);
  });

  it("releases an unfinished source-only handover when the controller is disposed", async () => {
    const drape = controller();
    const transition = await drape.prepare(photo("from"), photo("to"), {
      sourceOnly: true,
    });
    transition!.finish();
    drape.dispose();
    transition!.update(0.5);
    currentFrame?.();
    transition!.finish();
    expect(overlays.size).toBe(0);
    expect(stacks.get("raw-from")!.listeners()).toBe(0);
    expect(
      canvases.every((canvas) => canvas.width === 1 && canvas.height === 1)
    ).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("persistent neighbour mesh underlay", () => {
  const roi = {
    visible: { x: 1000, y: 2000, width: 4000, height: 3000 },
    density: 0.2,
  } as ImageView;
  const views = () => ({ sourceView: roi, targetView: roi });

  it("keeps one low-priority target projector, then switches to the original source pose without heading or time mixing", () => {
    const value = controller();
    const from = photo("from"),
      to = photo("to");
    const prepared = value.prepareNeighbor(from, to, views());
    expect(prepared).toBeDefined();
    expect(releases).toHaveLength(2);
    releases.forEach((release) => expect(release).toHaveBeenCalledOnce());
    stacks.forEach((stack) => expect(stack.listeners()).toBe(0));
    expect(values()).toHaveLength(1);
    expect(values()[0]).toMatchObject({
      priority: 110,
      opacity: 1,
      projective: { underlay: true },
    });
    const targetTexture = values()[0].texture;
    const fullTarget = new Matrix4().makeTranslation(2, 0, 0);
    // This point is inside the sensor but outside the requested ROI. Source
    // visibility must still use the full sensor rather than the crop frustum.
    const sensorUv = new Vector3(0.8, 0.2, 0);
    const worldPoint = sensorUv
      .clone()
      .applyMatrix4(fullTarget.clone().invert());
    expect(
      worldPoint
        .clone()
        .applyMatrix4(values()[0].projective.sourceProjection)
        .distanceTo(sensorUv)
    ).toBeLessThan(1e-12);
    expect(
      worldPoint.clone().applyMatrix4(values()[0].projective.sceneToTexture).x
    ).toBeGreaterThan(1);
    const crop = new Matrix4().set(
      4,
      0,
      0,
      -0.25,
      0,
      4,
      0,
      1 - 10000 / 3000,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      1
    );
    expect(
      values()[0].projective.sceneToTexture.equals(
        crop.clone().multiply(new Matrix4().makeTranslation(2, 0, 0))
      )
    ).toBe(true);
    expect(fixtures.projection).toHaveBeenCalledWith(
      to.record,
      to.calibration,
      to.pose,
      expect.any(Matrix4)
    );
    expect(fixtures.enu).toHaveBeenCalledWith(
      [7.2, 51.27],
      expect.any(Matrix4),
      from.pose,
      from.altitude
    );
    expect(canvases.map((canvas) => [canvas.width, canvas.height])).toEqual([
      [800, 600],
      [800, 600],
    ]);
    expect(fixtures.draw.mock.calls.map((call) => call[2])).toEqual([
      { originX: 1000, originY: 2000, scale: 0.2 },
      { originX: 1000, originY: 2000, scale: 0.2 },
    ]);
    stacks.forEach((stack) => expect(stack.setView).not.toHaveBeenCalled());
    bearing = 180;
    prepared!.update(1);
    currentFrame?.();
    expect(values()[0].texture).toBe(targetTexture);
    prepared!.handover();
    expect(values()).toHaveLength(1);
    expect(values()[0].texture).not.toBe(targetTexture);
    expect(
      values()[0].projective.sceneToTexture.equals(
        crop.clone().multiply(new Matrix4().makeTranslation(1, 0, 0))
      )
    ).toBe(true);
    const sourceTexture = values()[0].texture;
    expect(
      values()[0].projective.sourceProjection.equals(
        new Matrix4().makeTranslation(1, 0, 0)
      )
    ).toBe(true);
    prepared!.finish();
    vi.advanceTimersByTime(60_000);
    expect(values()[0].texture).toBe(sourceTexture);
    fixtures.projection.mockImplementation((record: { id: string }) =>
      new Matrix4().makeTranslation(record.id === "from" ? 11 : 12, 0, 0)
    );
    layer.projectSceneToLngLat.mockReturnValue([7.3, 51.28]);
    currentFrame?.();
    const rebasedFull = new Matrix4().makeTranslation(11, 0, 0);
    const rebasedPoint = sensorUv
      .clone()
      .applyMatrix4(rebasedFull.clone().invert());
    expect(
      rebasedPoint
        .clone()
        .applyMatrix4(values()[0].projective.sourceProjection)
        .distanceTo(sensorUv)
    ).toBeLessThan(1e-12);
    expect(
      values()[0].projective.sceneToTexture.equals(
        crop.clone().multiply(rebasedFull)
      )
    ).toBe(true);
    expect(fixtures.enu).toHaveBeenCalledWith(
      [7.3, 51.28],
      expect.any(Matrix4),
      to.pose,
      to.altitude
    );
    expect(values()).toHaveLength(1);
    prepared!.dispose();
    expect(values()).toHaveLength(0);
  });

  it("reuses bounded composed ROI pixels across role replacement and invalidates obsolete handles", () => {
    const value = controller();
    const first = value.prepareNeighbor(photo("from"), photo("to"), views())!;
    const firstTarget = values()[0].texture;
    const allocations = canvases.length;
    const second = value.prepareNeighbor(photo("from"), photo("to"), views())!;
    expect(values()[0].texture).toBe(firstTarget);
    expect(canvases).toHaveLength(allocations);
    expect(fixtures.draw).toHaveBeenCalledTimes(2);
    first.handover();
    first.dispose();
    expect(values()).toHaveLength(1);
    expect(values()[0].texture).toBe(firstTarget);
    second.dispose();
  });

  it("preserves the previous underlay when replacement ROI pixels are not resident", () => {
    const value = controller();
    const first = value.prepareNeighbor(photo("from"), photo("to"), views())!;
    const targetTexture = values()[0].texture;
    stacks.get("raw-to")!.isResident.mockReturnValue(false);
    expect(
      value.prepareNeighbor(photo("from"), photo("to"), views())
    ).toBeUndefined();
    expect(values()[0].texture).toBe(targetTexture);
    first.handover();
    expect(values()).toHaveLength(1);
  });

  it("requires an already visible mesh and never loads one just for the underlay", () => {
    fixtures.runtimes = [];
    expect(
      controller().prepareNeighbor(photo("from"), photo("to"), views())
    ).toBeUndefined();
    expect(fixtures.acquire).not.toHaveBeenCalled();
    expect(fixtures.draw).not.toHaveBeenCalled();
  });

  it("rejects invalid ROI bounds without altering source views", () => {
    const invalid = { ...roi, visible: { ...roi.visible, x: -1 } } as ImageView;
    expect(
      controller().prepareNeighbor(photo("from"), photo("to"), {
        sourceView: invalid,
        targetView: roi,
      })
    ).toBeUndefined();
    stacks.forEach((stack) => expect(stack.setView).not.toHaveBeenCalled());
    expect(fixtures.draw).not.toHaveBeenCalled();
  });

  it("cleans newly borrowed resources after a snapshot failure", () => {
    fixtures.draw
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => {
        throw Error("copy failed");
      });
    expect(
      controller().prepareNeighbor(photo("from"), photo("to"), views())
    ).toBeUndefined();
    expect(values()).toHaveLength(0);
    expect(
      canvases.every((canvas) => canvas.width === 1 && canvas.height === 1)
    ).toBe(true);
  });
});

describe("building surface drape eligibility", () => {
  it.each(["rotation", "source", "neighbour"])(
    "allows visible local-frame 3d-tiles buildings for %s without treating them as terrain",
    async (mode) => {
      fixtures.runtimes = [
        {
          root: { visible: true, parent: null },
          mountsOnLocalFrame: true,
          providesTerrain: false,
          receivesScreenImages: true,
          hasRenderableContent: () => true,
        },
      ];
      const value = controller();
      const roi = {
        visible: { x: 1000, y: 2000, width: 4000, height: 3000 },
        density: 0.2,
      } as ImageView;
      const transition =
        mode === "neighbour"
          ? value.prepareNeighbor(photo("from"), photo("to"), {
              sourceView: roi,
              targetView: roi,
            })
          : await value.prepare(photo("from"), photo("to"), {
              sourceOnly: mode === "source",
            });
      expect(transition).toBeDefined();
      expect(values().some((overlay) => overlay.opacity === 1)).toBe(true);
      transition!.dispose();
    }
  );

  it.each(["hidden", "wrong-frame", "not-photo-surface"])(
    "rejects a building receiver that is %s",
    (reason) => {
      fixtures.runtimes = [
        {
          root: { visible: reason !== "hidden", parent: null },
          mountsOnLocalFrame: reason !== "wrong-frame",
          providesTerrain: false,
          receivesScreenImages: reason !== "not-photo-surface",
          hasRenderableContent: () => true,
        },
      ];
      const roi = {
        visible: { x: 1000, y: 2000, width: 4000, height: 3000 },
        density: 0.2,
      } as ImageView;
      expect(
        controller().prepareNeighbor(photo("from"), photo("to"), {
          sourceView: roi,
          targetView: roi,
        })
      ).toBeUndefined();
      expect(fixtures.acquire).not.toHaveBeenCalled();
    }
  );
});

describe("ready dual-photo handoff", () => {
  it("retains the exact source crop, reserves one slot at reveal, and waits for explicit disposal", async () => {
    const sourceView = {
      visible: { x: 4000, y: 3000, width: 1600, height: 1200 },
      density: 0.5,
    } as ImageView;
    const transition = await controller().prepare(photo("from"), photo("to"), {
      sourceView,
      requireSource: true,
      retainUntilReveal: true,
    });
    expect(transition).toBeDefined();
    expect(canvases.map((c) => [c.width, c.height])).toEqual([
      [800, 600],
      [800, 600],
    ]);
    expect(fixtures.draw).toHaveBeenCalledWith(
      expect.anything(),
      stacks.get("raw-from"),
      { originX: 4000, originY: 3000, scale: 0.5 },
      canvases[0]
    );
    expect(stacks.get("raw-from")!.setView).not.toHaveBeenCalled();
    bearing = 45;
    currentFrame?.();
    expect(values().map((v) => v.opacity)).toEqual([0.5, 0.5]);
    transition!.finish();
    transition!.reveal!();
    expect(values()).toHaveLength(1);
    expect(values()[0].priority).toBe(101);
    expect(values()[0].opacity).toBe(1);
    expect(values()[0].projective).toMatchObject({ underlay: true });
    await vi.advanceTimersByTimeAsync(5000);
    expect(values()).toHaveLength(1);
    transition!.dispose();
    expect(values()).toHaveLength(0);
  });
  it("keeps the existing photo when required source pixels are absent before target preparation", async () => {
    stacks.delete("raw-from");
    expect(
      await controller().prepare(photo("from"), photo("to"), {
        requireSource: true,
      })
    ).toBeUndefined();
    expect(fixtures.acquire).not.toHaveBeenCalled();
    expect(stacks.get("raw-to")!.setView).not.toHaveBeenCalled();
  });
});

describe("NG transition footprint decorations", () => {
  const decoration = () => ({
    backdropLook: { contrast: 0.95, brightness: 1.25, saturation: 0.85 },
    backdropTint: [0, 0, 0, 0.13] as const,
  });
  it("publishes both full-sensor frames with constant global backdrop and heading-weighted photographs", async () => {
    const look = decoration();
    const transition = await controller().prepare(photo("from"), photo("to"), {
      decoration: look,
      retainUntilReveal: true,
      sourceView: {
        visible: { x: 4000, y: 3000, width: 1600, height: 1200 },
        density: 0.5,
      } as ImageView,
    });
    expect(transition).toBeDefined();
    expect(values().map((v) => v.projective.frame)).toEqual([
      { opacity: 0.9, width: 2, feather: 50, featherOpacity: 0.8 / 0.9 },
      { opacity: 0, width: 2, feather: 50, featherOpacity: 0.8 / 0.9 },
    ]);
    expect(
      values()[0].projective.sourceProjection.equals(
        values()[0].projective.sceneToTexture
      )
    ).toBe(false);
    const full = values().map((v) => v.projective.sourceProjection.clone());
    look.backdropLook.contrast = 0.01;
    for (const angle of [0, 22.5, 45, 90]) {
      bearing = angle;
      currentFrame?.();
      expect(values().map((v) => v.backdropOpacity)).toEqual([1, 1]);
      expect(values()[0].opacity).toBeCloseTo(1 - angle / 90);
      expect(values()[1].opacity).toBeCloseTo(angle / 90);
      expect(values().map((v) => v.backdropLook?.contrast)).toEqual([
        0.95, 0.95,
      ]);
      expect(values().map((v) => v.backdropTint)).toEqual([
        [0, 0, 0, 0.13],
        [0, 0, 0, 0.13],
      ]);
      expect(values()[0].projective.frame!.opacity).toBeCloseTo(
        0.9 * (1 - angle / 90)
      );
      expect(values()[1].projective.frame!.opacity).toBeCloseTo(
        (0.9 * angle) / 90
      );
      values().forEach((v, i) =>
        expect(v.projective.sourceProjection).toEqual(full[i])
      );
    }
    transition!.finish();
    transition!.reveal!();
    expect(values()).toHaveLength(1);
    expect(values()[0].projective.frame!.opacity).toBe(0.9);
    expect(values()[0].backdropOpacity).toBe(1);
    transition!.dispose();
    expect(values()).toHaveLength(0);
  });
  it("keeps the single-source contour through reveal and clears it on cancellation", async () => {
    const drape = controller();
    const transition = await drape.prepare(photo("from"), photo("from"), {
      decoration: decoration(),
      retainUntilReveal: true,
    });
    bearing = 120;
    currentFrame?.();
    transition!.finish();
    transition!.reveal!();
    expect(values()).toHaveLength(1);
    expect(values()[0].projective.frame).toMatchObject({
      opacity: 0.9,
      width: 2,
    });
    expect(values()[0].backdropOpacity).toBe(1);
    drape.cancel();
    transition!.update(1);
    currentFrame?.();
    transition!.reveal!();
    expect(values()).toHaveLength(0);
  });
  it("leaves undecorated and seamless-neighbor projections without a frame or backdrop", async () => {
    const drape = controller();
    await drape.prepare(photo("from"), photo("to"));
    expect(
      values().every(
        (v) =>
          !v.projective.frame &&
          v.backdropOpacity === undefined &&
          !v.backdropLook
      )
    ).toBe(true);
    const view = {
      visible: { x: 0, y: 0, width: 800, height: 600 },
      density: 1,
    } as ImageView;
    drape.prepareNeighbor(photo("from"), photo("to"), {
      sourceView: view,
      targetView: view,
    });
    expect(values()).toHaveLength(1);
    expect(values()[0].projective.frame).toBeUndefined();
    expect(values()[0].backdropOpacity).toBeUndefined();
  });
});

it("prepares the decorated target at equal headings and mixes its footprint using travel progress", async () => {
  bearing = 90;
  const target = stacks.get("raw-to")!;
  target.visibleReady = false;
  const pending = controller().prepare(photo("from"), photo("to"), {
    retainUntilReveal: true,
    decoration: {
      backdropLook: { contrast: 0.5, brightness: 1.25, saturation: 0.5 },
      backdropTint: [0, 0, 0, 0.13],
    },
  });
  expect(fixtures.acquire).toHaveBeenCalledTimes(2);
  expect(target.setView).toHaveBeenCalledOnce();
  expect(values()).toHaveLength(0);
  target.visibleReady = true;
  target.emitState();
  const transition = await pending;
  expect(values()).toHaveLength(2);
  transition!.update(0.25);
  currentFrame?.();
  expect(values().map((v) => v.opacity)).toEqual([0.75, 0.25]);
  expect(values()[1].projective.frame!.opacity).toBeCloseTo(0.225);
  transition!.update(Number.NaN);
  currentFrame?.();
  currentFrame?.();
  expect(values()[1].opacity).toBe(0.25);
  expect(values().map((v) => v.backdropOpacity)).toEqual([1, 1]);
  transition!.finish();
  transition!.reveal!();
  expect(values()).toHaveLength(1);
  expect(values()[0].priority).toBe(101);
  expect(values()[0].projective.frame!.opacity).toBe(0.9);
  transition!.dispose();
  expect(values()).toHaveLength(0);
});
