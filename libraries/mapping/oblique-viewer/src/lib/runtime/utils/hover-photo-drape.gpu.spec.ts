import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Matrix4, Texture } from "three";
import type { Map as MaplibreMap } from "maplibre-gl";
import type { HoverPhotoProjection } from "../footprint-outline-layer";
import { createHoverPhotoDrape } from "./hover-photo-drape";

const state = vi.hoisted(() => ({
  scene: vi.fn(),
  acquire: vi.fn(),
  subscribe: vi.fn(),
  composers: [] as Array<{
    attached: unknown;
    texture: Texture;
    dispose: () => void;
    freezeSnapshot: () => unknown;
    renderToTarget: ((
      renderer: unknown,
      rect: unknown,
      size: { width: number; height: number }
    ) => unknown) & {
      mock: {
        lastCall?: [unknown, unknown, { width: number; height: number }];
      };
    };
  }>,
}));
vi.mock("@carma-commons/image-pyramid", async () => {
  const { Texture } = await import("three");
  return {
    ThreeImageLevels: class {
      attached: ReturnType<typeof makeStack> | null = null;
      texture = new Texture();
      last: { texture: Texture; rect: unknown; revision: number } | null = null;
      dispose = vi.fn();
      constructor() {
        state.composers.push(this);
      }
      attach(value: ReturnType<typeof makeStack> | null) {
        this.attached = value;
      }
      renderToTarget = vi.fn(
        (
          _renderer: unknown,
          rect: unknown,
          size: { width: number; height: number }
        ) => {
          if (!this.attached) return null;
          this.texture.image = { ...size };
          this.last = {
            texture: this.texture,
            rect,
            revision: this.attached.pixelRevision + 1,
          };
          return this.last;
        }
      );
      freezeSnapshot = vi.fn(() => {
        this.attached = null;
        return this.last;
      });
    },
  };
});
vi.mock("@carma-mapping/engines/maplibre", () => ({
  acquireSharedThreeScene: state.scene,
  getSharedThreeSceneRuntimes: () => [],
  subscribeSharedThreeTerrain: () => () => {},
}));
vi.mock("./native-preview-pool", () => ({
  nativePreviewSource: ({ imageId }: { imageId: string }) => ({
    id: imageId,
    kind: "avif",
    url: imageId,
  }),
  nativePixelPool: {
    acquire: state.acquire,
    subscribe: state.subscribe,
    metrics: { images: [] },
  },
}));
vi.mock("./oblique-viewport-source", () => ({
  originalOf: () => "native.avif",
  pyramidOf: () => "native.avif",
  pyramidOptionsOf: () => ({}),
}));
vi.mock("../../core/utils/calibration", () => ({
  getCameraCalibration: () => ({ widthPx: 4000, heightPx: 3000 }),
}));
vi.mock("../../core/utils/image-projection", () => ({
  sceneToPhotoEnu: () => new Matrix4(),
}));
vi.mock("../footprint-outline-layer", () => ({ MAX_HOVER_PHOTO_TRAILS: 5 }));
vi.mock("./mosaic-region-quality", () => ({
  readMosaicRegionQuality: (
    stack: { pixelRevision: number },
    _rect: unknown,
    previous?: { revision: number }
  ) =>
    previous?.revision === stack.pixelRevision
      ? null
      : { revision: stack.pixelRevision },
}));
function makeStack() {
  const listeners = new Set<() => void>();
  const stack = {
    source: { priority: "low" },
    pixelRevision: 0,
    pyramid: {
      native: { width: 4000, height: 3000 },
      levels: [{ level: 4, width: 1000, height: 750, cols: 2, rows: 2 }],
    },
    plan: { visibleTarget: { level: 4, col0: 0, row0: 0, col1: 2, row1: 2 } },
    metrics: { visibleReady: false },
    error: null,
    setView: vi.fn(),
    configure: vi.fn(),
    onContentChange: (fn: () => void) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    improve: () => {
      stack.pixelRevision++;
      listeners.forEach((fn) => fn());
    },
  };
  return stack;
}
type Published = {
  texture: Texture;
  textureRevision: number;
  opacity: number;
  projective?: { sourceProjection: Matrix4; sceneToTexture: Matrix4 };
};
let sources: Map<string, ReturnType<typeof makeStack>>;
let overlays: Map<string, Published>;
let mosaics: Map<string, readonly Published[]>;
let releases: Array<ReturnType<typeof vi.fn>>;
let drape: ReturnType<typeof createHoverPhotoDrape>;
const photo = (id: string, current = true): HoverPhotoProjection =>
  ({
    record: { id, sourceId: id, cameraId: "camera" },
    dataset: {},
    opacity: current ? 1 : 0.6,
    isCurrent: current,
    sceneToTexture: new Matrix4().makeTranslation(3, 5, 7),
  } as HoverPhotoProjection);
const visible = () => [...overlays.values()];
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(performance, "now").mockImplementation(() => Date.now());
  state.composers.length = 0;
  sources = new Map([
    ["a", makeStack()],
    ["b", makeStack()],
  ]);
  overlays = new Map();
  mosaics = new Map();
  releases = [];
  state.acquire.mockImplementation(({ id }: { id: string }) => {
    const release = vi.fn();
    releases.push(release);
    return { stack: sources.get(id), release };
  });
  state.subscribe.mockReturnValue(() => {});
  state.scene.mockReturnValue({
    release: vi.fn(),
    layer: {
      getRenderer: () => ({ capabilities: { maxTextureSize: 4096 } }),
      getLocalFrame: () => ({ revision: 1, sceneFromLocal: new Matrix4() }),
      projectSceneToLngLat: () => [7.2, 51.27],
      addBeforeRenderCallback: () => () => {},
      setMapStyleScreenOverlay: (id: string, value: Published | null) => {
        if (value) overlays.set(id, value);
        else overlays.delete(id);
      },
      setMapStylePhotoMosaic: (
        id: string,
        value: readonly Published[] | null
      ) => {
        if (value) mosaics.set(id, value);
        else mosaics.delete(id);
      },
    },
  });
  vi.stubGlobal(
    "OffscreenCanvas",
    vi.fn(() => {
      throw Error("No CPU recomposition");
    })
  );
  drape = createHoverPhotoDrape({
    triggerRepaint: vi.fn(),
  } as unknown as MaplibreMap);
});
afterEach(() => {
  drape.dispose();
  releases.forEach((release) => expect(release).toHaveBeenCalledOnce());
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe("hover GPU tile snapshots", () => {
  it("coalesces tile improvements at 30 Hz without CPU composition or a new texture upload", async () => {
    drape.update([photo("a")]);
    const composer = state.composers[0];
    expect(composer.renderToTarget).toHaveBeenCalledOnce();
    const initial = visible()[0];
    sources.get("a")!.improve();
    sources.get("a")!.improve();
    expect(composer.renderToTarget).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(34);
    expect(composer.renderToTarget).toHaveBeenCalledTimes(2);
    expect(visible()[0].texture).toBe(initial.texture);
    expect(visible()[0].texture.version).toBe(0);
    expect(visible()[0].textureRevision).toBe(3);
    expect(
      visible()[0].projective?.sourceProjection.equals(
        photo("a").sceneToTexture
      )
    ).toBe(true);
    expect(globalThis.OffscreenCanvas).not.toHaveBeenCalled();
  });
  it("keeps the clicked GPU snapshot behind the preview and stops later refinements", async () => {
    drape.update([photo("a")]);
    const texture = visible()[0].texture,
      composer = state.composers[0];
    const releasePin = drape.pin("a");
    expect(releasePin).toBeTypeOf("function");
    expect(composer.freezeSnapshot).toHaveBeenCalledOnce();
    expect(releases[0]).toHaveBeenCalledOnce();
    drape.update([]);
    sources.get("a")!.improve();
    await vi.advanceTimersByTimeAsync(100);
    const held = [...mosaics.values()].flat();
    expect(held).toHaveLength(1);
    expect(held[0].texture).toBe(texture);
    expect(held[0].opacity).toBe(1);
    expect(composer.renderToTarget).toHaveBeenCalledOnce();
    expect(composer.dispose).not.toHaveBeenCalled();
    releasePin!();
    expect(composer.dispose).toHaveBeenCalledOnce();
    expect(mosaics.size).toBe(0);
  });
  it("downsamples a retired hover once from resident tiles, without changing its requested view", async () => {
    drape.update([photo("a")]);
    const old = sources.get("a")!,
      composer = state.composers[0];
    const views = old.setView.mock.calls.length;
    drape.update([photo("b"), photo("a", false)]);
    expect(composer.renderToTarget).toHaveBeenCalledTimes(2);
    const size = composer.renderToTarget.mock.lastCall?.[2];
    expect(Math.max(size!.width, size!.height)).toBeLessThanOrEqual(512);
    expect(old.setView).toHaveBeenCalledTimes(views);
    expect(composer.freezeSnapshot).toHaveBeenCalledOnce();
    expect(composer.attached).toBeNull();
    old.improve();
    await vi.advanceTimersByTimeAsync(100);
    drape.update([photo("b"), photo("a", false)]);
    expect(composer.renderToTarget).toHaveBeenCalledTimes(2);
    expect(composer.dispose).not.toHaveBeenCalled();
    expect(
      [...mosaics.values()]
        .flat()
        .some((value) => value.texture === composer.texture)
    ).toBe(true);
  });
  it("does not replace GPU tiles with a late prefetched canvas", async () => {
    drape.dispose();
    let resolve: (value: OffscreenCanvas) => void = () => {};
    const base = new Promise<OffscreenCanvas>((done) => {
      resolve = done;
    });
    drape = createHoverPhotoDrape(
      { triggerRepaint: vi.fn() } as unknown as MaplibreMap,
      { readBase: () => base }
    );
    drape.update([photo("a")]);
    const texture = visible()[0].texture;
    const canvas = { width: 2000, height: 1500 } as OffscreenCanvas;
    resolve(canvas);
    await Promise.resolve();
    await Promise.resolve();
    expect(visible()[0].texture).toBe(texture);
    expect(canvas.width).toBe(1);
    expect(canvas.height).toBe(1);
  });
});
