import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Matrix4, Texture } from "three";
import type { Map as MaplibreMap } from "maplibre-gl";
import {
  createPhotoRotationDrape,
  type PhotoRotationDrape,
} from "./photo-rotation-drape";

const state = vi.hoisted(() => ({
  scene: vi.fn(),
  acquire: vi.fn(),
  peek: vi.fn(),
  projection: vi.fn(),
  render: vi.fn(),
  composers: [] as Array<{
    attached: unknown;
    dispose: ReturnType<typeof vi.fn>;
    attach: (value: unknown) => void;
    texture: unknown;
  }>,
  coverage: undefined as
    | undefined
    | { x: number; y: number; width: number; height: number },
}));
vi.mock("@carma-commons/image-pyramid", async () => {
  const { Texture } = await import("three");
  return {
    ThreeImageLevels: class {
      attached: unknown;
      texture = new Texture();
      dispose = vi.fn();
      constructor() {
        this.texture.image = { width: 800, height: 600 };
        state.composers.push(this);
      }
      attach(value: unknown) {
        this.attached = value;
      }
      renderToTarget(
        renderer: unknown,
        rect: { x: number; y: number; width: number; height: number },
        size: unknown
      ) {
        state.render(this.attached, rect, size, renderer);
        const stack = this.attached as ReturnType<typeof makeStack>;
        return {
          texture: this.texture,
          rect: state.coverage ?? rect,
          revision: stack.pixelRevision + 1,
        };
      }
    },
    tileRangeFor: () => ({ col0: 0, col1: 1, row0: 0, row1: 1 }),
  };
});
vi.mock("./native-preview-pool", () => ({
  nativePixelPool: { acquire: state.acquire, peek: state.peek },
  nativePreviewSource: (options: { imageId: string }) => ({
    id: options.imageId,
    kind: "avif",
    url: options.imageId,
  }),
}));
vi.mock("./oblique-viewport-source", () => ({
  originalOf: () => "native.avif",
  pyramidOf: () => "native.avif",
  pyramidOptionsOf: () => ({}),
}));
vi.mock("./preview-region-ready", () => ({ residentPreviewLevel: () => 4 }));
vi.mock("./mosaic-region-quality", () => ({
  readMosaicRegionQuality: (
    stack: { pixelRevision: number },
    _region: unknown,
    previous?: { revision: number }
  ) =>
    previous?.revision === stack.pixelRevision
      ? undefined
      : { revision: stack.pixelRevision },
}));
vi.mock("@carma-mapping/engines/maplibre", () => ({
  acquireSharedThreeScene: state.scene,
  getSharedThreeSceneRuntimes: () => [
    {
      mountsOnLocalFrame: true,
      receivesScreenImages: true,
      root: { visible: true },
      hasRenderableContent: () => true,
    },
  ],
}));
vi.mock("../../core/utils/image-projection", () => ({
  imageProjectionMatrix: state.projection,
  sceneToPhotoEnu: () => new Matrix4(),
}));
function makeStack() {
  const listeners = new Set<() => void>();
  const stack = {
    pixelRevision: 0,
    pyramid: {
      native: { width: 16000, height: 12000 },
      levels: [{ level: 4, width: 1000, height: 750, cols: 1, rows: 1 }],
    },
    plan: {
      target: 4,
      layers: [4],
      visibleTarget: { level: 4, col0: 0, col1: 1, row0: 0, row1: 1 },
    },
    metrics: { decodedBytes: 4096 },
    error: null,
    ready: Promise.resolve(),
    isResident: () => true,
    setView: vi.fn(),
    subscribe: (fn: () => void) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
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
  projective: { sourceProjection: Matrix4; sceneToTexture: Matrix4 };
};
const photo = (id: string) =>
  ({
    record: { id, sourceId: id },
    dataset: { previewPath: "native/" },
    calibration: { widthPx: 16000, heightPx: 12000 },
    pose: { bearingDeg: 90 },
    altitude: 500,
  } as unknown as Parameters<PhotoRotationDrape["prepare"]>[0]);
let sources: Map<string, ReturnType<typeof makeStack>>;
let overlays: Map<string, Published>;
let beforeRender: (() => void) | undefined;
let drape: PhotoRotationDrape;
let releases: Array<ReturnType<typeof vi.fn>>;
let renderer: { capabilities: { maxTextureSize: number } } | undefined;
beforeEach(() => {
  vi.useFakeTimers();
  state.render.mockClear();
  state.projection.mockReset();
  state.composers.length = 0;
  state.coverage = undefined;
  sources = new Map([
    ["from", makeStack()],
    ["to", makeStack()],
  ]);
  overlays = new Map();
  releases = [];
  renderer = { capabilities: { maxTextureSize: 4096 } };
  state.peek.mockImplementation((source) => sources.get(source.id));
  state.acquire.mockImplementation((source) => {
    const release = vi.fn();
    releases.push(release);
    return { stack: sources.get(source.id), release };
  });
  state.projection.mockImplementation((record: { id: string }) =>
    new Matrix4().makeTranslation(record.id === "from" ? 1 : 2, 0, 0)
  );
  state.scene.mockReturnValue({
    release: vi.fn(),
    layer: {
      getRenderer: () => renderer,
      getLocalFrame: () => ({ sceneFromLocal: new Matrix4() }),
      projectSceneToLngLat: () => [7.2, 51.27],
      addBeforeRenderCallback: (fn: () => void) => {
        beforeRender = fn;
        return () => {
          beforeRender = undefined;
        };
      },
      setMapStyleScreenOverlay: (id: string, value: Published | null) => {
        if (!value) overlays.delete(id);
        else
          overlays.set(id, {
            ...value,
            projective: {
              ...value.projective,
              sourceProjection: value.projective.sourceProjection.clone(),
              sceneToTexture: value.projective.sceneToTexture.clone(),
            },
          });
      },
    },
  });
  vi.stubGlobal(
    "OffscreenCanvas",
    vi.fn(() => {
      throw Error("CPU composition is forbidden");
    })
  );
  drape = createPhotoRotationDrape({
    getCanvas: () => ({ width: 800, height: 600 }),
    getBearing: () => 0,
    triggerRepaint: vi.fn(),
  } as unknown as MaplibreMap);
});
afterEach(() => {
  drape.dispose();
  releases.forEach((release) => expect(release).toHaveBeenCalledOnce());
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const published = () => [...overlays.values()];

describe("GPU rotation drape snapshots", () => {
  it("composes borrowed GPU textures and never creates or uploads a CPU canvas", async () => {
    expect(await drape.prepare(photo("from"), photo("to"))).toBeDefined();
    expect(state.render).toHaveBeenCalledTimes(2);
    expect(globalThis.OffscreenCanvas).not.toHaveBeenCalled();
    expect(published().map((value) => value.texture.version)).toEqual([0, 0]);
    expect(published().map((value) => value.textureRevision)).toEqual([1, 1]);
    expect(state.composers[0].attached).toBeNull();
    expect(state.composers[1].attached).toBe(sources.get("to"));
  });
  it("coalesces target tile updates while retaining the frozen source and its calibrated depth camera", async () => {
    const transition = await drape.prepare(photo("from"), photo("to"), {
      retainUntilReveal: true,
    });
    const initial = published();
    sources.get("from")!.improve();
    sources.get("to")!.improve();
    sources.get("to")!.improve();
    beforeRender?.();
    expect(state.render).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(34);
    beforeRender?.();
    expect(state.render).toHaveBeenCalledTimes(3);
    expect(state.render.mock.lastCall?.[0]).toBe(sources.get("to"));
    expect(published()[0].texture).toBe(initial[0].texture);
    expect(published()[0].textureRevision).toBe(1);
    expect(published()[1].texture).toBe(initial[1].texture);
    expect(published()[1].texture.version).toBe(0);
    expect(published()[1].textureRevision).toBe(3);
    expect(state.projection).toHaveBeenCalledTimes(2);
    expect(
      published()[1].projective.sourceProjection.equals(
        initial[1].projective.sourceProjection
      )
    ).toBe(true);
    transition!.finish();
    sources.get("from")!.improve();
    await vi.advanceTimersByTimeAsync(34);
    beforeRender?.();
    expect(state.render).toHaveBeenCalledTimes(3);
  });
  it("updates only the texture crop transform when GPU capacity changes, not the full-sensor camera", async () => {
    await drape.prepare(photo("from"), photo("to"));
    const sourceProjection = published()[1].projective.sourceProjection.clone();
    state.coverage = { x: -512, y: -256, width: 17408, height: 12800 };
    sources.get("to")!.improve();
    await vi.advanceTimersByTimeAsync(34);
    beforeRender?.();
    const next = published()[1];
    expect(next.projective.sourceProjection.equals(sourceProjection)).toBe(
      true
    );
    expect(next.projective.sceneToTexture.equals(sourceProjection)).toBe(false);
    expect(state.projection).toHaveBeenCalledTimes(2);
  });
  it("detaches retained targets on cancellation and disposes each owned GPU composer once", async () => {
    const transition = await drape.prepare(photo("from"), photo("to"));
    transition!.dispose();
    expect(state.composers.every((value) => value.attached === null)).toBe(
      true
    );
    expect(state.composers[0].dispose).toHaveBeenCalledOnce();
    expect(state.composers[1].dispose).not.toHaveBeenCalled();
    sources.get("to")!.improve();
    await vi.advanceTimersByTimeAsync(34);
    expect(state.render).toHaveBeenCalledTimes(2);
    drape.dispose();
    expect(state.composers[1].dispose).toHaveBeenCalledOnce();
  });
  it("does not fall back to CPU composition when the shared renderer is unavailable", async () => {
    renderer = undefined;
    expect(await drape.prepare(photo("from"), photo("to"))).toBeUndefined();
    expect(state.render).not.toHaveBeenCalled();
    expect(globalThis.OffscreenCanvas).not.toHaveBeenCalled();
  });
});
