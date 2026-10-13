import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Matrix3 } from "three";
import type { Map as MaplibreMap } from "maplibre-gl";
import type { ImageView } from "@carma-commons/image-pyramid";
import type { ObliqueViewportPhoto } from "./oblique-viewport-source";
import { createPreparedPreviewBridge } from "./prepared-preview-bridge";
import { takeNativePreviewComposer } from "./native-preview-pool";

const state = vi.hoisted(() => ({
  overlay: vi.fn(),
  sceneRelease: vi.fn(),
  attach: vi.fn(),
  render: vi.fn(),
  dispose: vi.fn(),
  source: { id: "target", url: "https://imagery.example/target.avif" },
  renderer: {},
  stack: { metrics: { visibleReady: true }, plan: { visibleTarget: {} } },
  rendererAvailable: true,
  texture: {},
}));
vi.mock("@carma-mapping/engines/maplibre", () => ({
  acquireSharedThreeScene: () => ({
    layer: {
      setMapStyleScreenOverlay: state.overlay,
      getRenderer: () => (state.rendererAvailable ? state.renderer : undefined),
    },
    release: state.sceneRelease,
  }),
}));
vi.mock("@carma-commons/image-pyramid", () => ({
  ImageLevelStackPool: class {},
  ThreeImageLevels: class {
    attach = state.attach;
    renderToTarget = state.render;
    dispose = state.dispose;
  },
}));
vi.mock("./tiff-download", () => ({ downloadTiffJpeg: vi.fn() }));
vi.mock("../../core/utils/calibration", () => ({
  getCameraCalibration: () => ({ widthPx: 4000, heightPx: 3000 }),
}));
vi.mock("./oblique-viewport-source", () => ({
  originalOf: () => state.source.url,
  pyramidOf: () => state.source.url,
}));
vi.mock("./native-preview-pool", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./native-preview-pool")>()),
  nativePreviewSource: () => state.source,
  nativePixelPool: { peek: () => state.stack },
  lastNativePreviewView: () => {
    throw Error("Global view metadata must not select the landing crop");
  },
}));
const photo = {
  record: { id: "target", sourceId: "target", cameraId: "camera" },
  dataset: {},
} as ObliqueViewportPhoto;
const landingView = {
  visible: { x: 400, y: 600, width: 800, height: 600 },
  density: 0.5,
} as ImageView;
const mapOf = () => ({ triggerRepaint: vi.fn() } as unknown as MaplibreMap);
beforeEach(() => {
  vi.clearAllMocks();
  state.stack.metrics.visibleReady = true;
  state.rendererAvailable = true;
  state.render.mockReturnValue({
    texture: state.texture,
    rect: { x: 400, y: 600, width: 800, height: 600 },
  });
});
afterEach(() => vi.useRealTimers());

describe("prepared target frame bridge", () => {
  it("composes before the cut, reveals only the complete target and transfers the same GPU composer once", () => {
    const map = mapOf();
    const bridge = createPreparedPreviewBridge(
      map,
      photo,
      new Matrix3(),
      false,
      landingView
    );
    expect(state.attach).toHaveBeenCalledWith(state.stack);
    expect(state.render).toHaveBeenCalledWith(
      state.renderer,
      { x: 400, y: 600, width: 800, height: 600 },
      { width: 400, height: 300 }
    );
    expect(state.overlay).not.toHaveBeenCalled();
    bridge.update(0);
    bridge.update(0.999);
    expect(state.overlay).not.toHaveBeenCalled();
    bridge.update(1);
    const overlay = state.overlay.mock.lastCall?.[1];
    expect(overlay).toMatchObject({
      texture: state.texture,
      opacity: 1,
      priority: 120,
      showBasemapLabels: false,
    });
    expect(overlay.projective).toBeUndefined();
    expect(
      overlay.viewportToTexture.equals(
        new Matrix3().set(5, 0, -0.5, 0, 5, -3, 0, 0, 1)
      )
    ).toBe(true);
    const composer = takeNativePreviewComposer(
      map,
      state.source as never,
      state.renderer as never
    );
    expect(composer?.renderToTarget).toBe(state.render);
    expect(
      takeNativePreviewComposer(
        map,
        state.source as never,
        state.renderer as never
      )
    ).toBeUndefined();
    bridge.dispose();
    bridge.dispose();
    expect(state.dispose).not.toHaveBeenCalled();
    expect(state.overlay.mock.lastCall?.[1]).toBeNull();
    expect(state.sceneRelease).toHaveBeenCalledOnce();
    composer!.dispose();
  });

  it("publishes the ready target at progress zero and follows every physical camera projection without recomposing", () => {
    const map = mapOf();
    const first = new Matrix3().set(0.8, 0.1, 0.02, -0.1, 0.9, 0.03, 0, 0, 1);
    const final = new Matrix3().set(0.6, -0.2, 0.1, 0.2, 0.6, 0.2, 0, 0, 1);
    let current = first;
    const projection = vi.fn(() => current);
    const bridge = createPreparedPreviewBridge(
      map,
      photo,
      new Matrix3(),
      true,
      landingView,
      projection
    );
    const crop = new Matrix3().set(5, 0, -0.5, 0, 5, -3, 0, 0, 1);
    expect(state.overlay).not.toHaveBeenCalled();
    bridge.update(0);
    expect(
      state.overlay.mock.lastCall?.[1].viewportToTexture.equals(
        crop.clone().multiply(first)
      )
    ).toBe(true);
    expect(state.overlay.mock.lastCall?.[1].texture).toBe(state.texture);
    current = final;
    bridge.update(0.5);
    expect(
      state.overlay.mock.lastCall?.[1].viewportToTexture.equals(
        crop.clone().multiply(final)
      )
    ).toBe(true);
    bridge.finish();
    expect(projection).toHaveBeenCalledTimes(3);
    expect(state.render).toHaveBeenCalledOnce();
    bridge.dispose();
    bridge.update(1);
    expect(projection).toHaveBeenCalledTimes(3);
  });

  it("holds an unclaimed target without a timer and releases it once on cancellation", () => {
    vi.useFakeTimers();
    const map = mapOf();
    const bridge = createPreparedPreviewBridge(
      map,
      photo,
      new Matrix3(),
      true,
      landingView
    );
    bridge.finish();
    vi.advanceTimersByTime(60_000);
    expect(state.dispose).not.toHaveBeenCalled();
    bridge.dispose();
    bridge.dispose();
    expect(state.dispose).toHaveBeenCalledOnce();
    expect(
      takeNativePreviewComposer(
        map,
        state.source as never,
        state.renderer as never
      )
    ).toBeUndefined();
    const calls = state.overlay.mock.calls.length;
    bridge.finish();
    bridge.update(1);
    expect(state.overlay).toHaveBeenCalledTimes(calls);
  });

  it("rejects resident pixels when no render target was composed and cleans up", () => {
    state.render.mockReturnValue(null);
    const map = mapOf();
    expect(() =>
      createPreparedPreviewBridge(map, photo, new Matrix3(), true, landingView)
    ).toThrow(/darstellbar/);
    expect(state.dispose).toHaveBeenCalledOnce();
    expect(state.sceneRelease).toHaveBeenCalledOnce();
    expect(
      state.overlay.mock.calls.every(([, overlay]) => overlay === null)
    ).toBe(true);
    expect(
      takeNativePreviewComposer(
        map,
        state.source as never,
        state.renderer as never
      )
    ).toBeUndefined();
  });

  it("rejects incomplete pixels before creating a target", () => {
    state.stack.metrics.visibleReady = false;
    expect(() =>
      createPreparedPreviewBridge(
        mapOf(),
        photo,
        new Matrix3(),
        true,
        landingView
      )
    ).toThrow(/vollständig geladen/);
    expect(state.render).not.toHaveBeenCalled();
    expect(state.dispose).not.toHaveBeenCalled();
    expect(state.sceneRelease).toHaveBeenCalledOnce();
  });

  it("rejects a missing renderer without leaving a scene lease", () => {
    state.rendererAvailable = false;
    expect(() =>
      createPreparedPreviewBridge(
        mapOf(),
        photo,
        new Matrix3(),
        true,
        landingView
      )
    ).toThrow(/zusammengesetzt/);
    expect(state.render).not.toHaveBeenCalled();
    expect(state.sceneRelease).toHaveBeenCalledOnce();
  });
});
