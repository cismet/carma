import { act, cleanup, render } from "@testing-library/react";
import type { ComponentProps } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";
import type { WebGLRenderer } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CssPixels, DevicePixels, Ratio } from "@carma-units";
import type {
  ScenePreviewImageGeometry,
  useScenePreviewImage,
} from "./hooks/useScenePreviewImage";

type SceneOptions = Parameters<typeof useScenePreviewImage>[0];
const scene = vi.hoisted(() => ({
  options: null as SceneOptions | null,
  enabled: true,
}));
vi.mock("./hooks/useScenePreviewImage", () => ({
  useScenePreviewImage: (options: SceneOptions) => {
    scene.options = options;
    return scene.enabled;
  },
}));
vi.mock("./utils/cameraMath", () => ({
  readCameraToCenterDistancePx: () => 400,
}));
const availability = vi.hoisted(() => ({
  missing: false,
  reportMissing: vi.fn(),
  reportAvailable: vi.fn(),
}));
vi.mock("./utils/preview-thumbnail-cache", () => ({
  isPreviewSourceMissing: () => availability.missing,
  reportPreviewSourceMissing: availability.reportMissing,
  reportPreviewSourceAvailable: availability.reportAvailable,
}));

type Rect = { x: number; y: number; width: number; height: number };
const streaming = vi.hoisted(() => ({
  sources: [] as {
    id: string;
    url: string;
    kind: string;
    jpegLevels?: readonly number[];
  }[],
  views: [] as { visible: Rect; density: number }[],
  released: 0,
  disposed: 0,
  rendered: [] as { rect: Rect; size: { width: number; height: number } }[],
  drawn: 0,
  ready: Promise.resolve({}) as Promise<unknown>,
  texture: { isTexture: true },
}));
vi.mock("@carma-commons/image-pyramid", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@carma-commons/image-pyramid")
  >();
  const stack = {
    get ready() {
      return streaming.ready;
    },
    pyramid: null,
    plan: null,
    metrics: { decodedBytes: 0, budgetBytes: 1, compressedBytes: 0 },
    setView: (view: (typeof streaming.views)[number]) =>
      streaming.views.push(view),
    onContentChange: () => () => undefined,
    isResident: () => false,
  };
  return {
    ...actual,
    ImageLevelStackPool: class {
      metrics = { images: [], decodedBytes: 0, maxImages: 8 };
      acquire(source: (typeof streaming.sources)[number]) {
        streaming.sources.push(source);
        return { stack, release: () => streaming.released++ };
      }
    },
    ThreeImageLevels: class {
      featherPx = 0;
      attach() {}
      renderToTarget(
        _renderer: unknown,
        rect: Rect,
        size: { width: number; height: number }
      ) {
        streaming.rendered.push({ rect, size });
        return {
          texture: streaming.texture,
          rect,
          revision: streaming.rendered.length,
        };
      }
      dispose() {
        streaming.disposed++;
      }
    },
    drawImageLevels: () => {
      streaming.drawn++;
    },
  };
});

let NativePixels: typeof import("./ObliqueImagePreview.NativePixels").NativePixels;
const geometry = (x = 0): ScenePreviewImageGeometry => ({
  viewport: { width: 800 as CssPixels, height: 600 as CssPixels },
  image: { width: 1200 as CssPixels, height: 1600 as CssPixels },
  offset: { x: x as CssPixels, y: 0 as CssPixels },
  pixelRatio: 2 as Ratio,
});
const renderer = {} as WebGLRenderer;
const setup = (
  overrides: Partial<ComponentProps<typeof NativePixels>> = {}
) => {
  const handlers = new Map<string, () => void>();
  const map = {
    on: vi.fn((type: string, handler: () => void) =>
      handlers.set(type, handler)
    ),
    off: vi.fn(),
    triggerRepaint: vi.fn(),
    isMoving: vi.fn(() => false),
    transform: { width: 800, height: 600, centerOffset: { x: 0, y: 0 } },
  } as unknown as MaplibreMap;
  const props: ComponentProps<typeof NativePixels> = {
    map,
    rootRef: { current: document.createElement("div") },
    path: "/images",
    imageId: "photo",
    nativeSize: { width: 10652 as DevicePixels, height: 14204 as DevicePixels },
    halfFovTan: 0.5,
    principal: { xOffset: 0, yOffset: 0 },
    rollDeg: 0,
    dimImage: false,
    sourceUrl: "https://imagery.test/2026/photo.avif",
    avifPyramidUrl: "https://imagery.test/2026/photo.avif",
    avifOnly: true,
    onSourceLoaded: vi.fn(),
    onError: vi.fn(),
    ...overrides,
  };
  const view = render(<NativePixels {...props} />);
  return { ...view, props, map, handlers };
};

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  Object.assign(streaming, {
    sources: [],
    views: [],
    released: 0,
    disposed: 0,
    rendered: [],
    drawn: 0,
  });
  streaming.ready = Promise.resolve({
    native: { width: 10652, height: 14204 },
    levels: [],
  });
  availability.missing = false;
  scene.options = null;
  scene.enabled = true;
  NativePixels = (await import("./ObliqueImagePreview.NativePixels"))
    .NativePixels;
});
afterEach(() => cleanup());

describe("native preview pixels from the level stack", () => {
  it("composes the camera's crop into a render target within the same frame", async () => {
    setup();
    await act(async () => {});
    act(() => scene.options!.onBeforeRender?.(geometry(), renderer));
    expect(streaming.sources).toEqual([
      expect.objectContaining({
        kind: "avif",
        url: "https://imagery.test/2026/photo.avif",
      }),
    ]);
    const [{ visible, density }] = streaming.views;
    const [{ rect, size }] = streaming.rendered;
    // The render target covers the requested crop plus a margin at the same density.
    expect(rect.x).toBeLessThanOrEqual(visible.x);
    expect(rect.y).toBeLessThanOrEqual(visible.y);
    expect(rect.x + rect.width).toBeGreaterThanOrEqual(
      visible.x + visible.width
    );
    expect(size.width / rect.width).toBeCloseTo(density, 2);
    expect(scene.options!.contentRef!.current).toEqual({
      texture: streaming.texture,
      crop: rect,
      revision: 1,
    });
  });

  it("follows every camera frame without waiting for decoded pixels", async () => {
    setup();
    await act(async () => {});
    act(() => scene.options!.onBeforeRender?.(geometry(0), renderer));
    act(() => scene.options!.onBeforeRender?.(geometry(120), renderer));
    expect(streaming.rendered).toHaveLength(2);
    expect(streaming.rendered[1].rect.x).not.toBe(streaming.rendered[0].rect.x);
    expect(scene.options!.contentRef!.current?.crop).toBe(
      streaming.rendered[1].rect
    );
  });

  it("streams the JPEG family instead of a TIFF original", () => {
    setup({
      avifOnly: false,
      avifPyramidUrl: undefined,
      tiff: true,
      sourceUrl: "https://imagery.test/originals/photo.tif",
      minimumQualityLevel: "1",
    });
    expect(streaming.sources[0]).toMatchObject({
      kind: "jpeg",
      url: expect.stringMatching(/\/images\/1\/photo\.jpg$/),
      jpegLevels: [1, 2, 3, 4, 5, 6],
    });
  });

  it("skips a source known to be missing", () => {
    availability.missing = true;
    const { props } = setup();
    expect(streaming.sources).toHaveLength(0);
    expect(props.onError).toHaveBeenCalledWith(
      "photo",
      expect.objectContaining({ missing: true })
    );
  });

  it("reports a 404 pyramid as missing", async () => {
    streaming.ready = Promise.reject(
      new Error("AVIF range request answered 404; refusing a full download")
    );
    const { props } = setup();
    await act(async () => {});
    expect(availability.reportMissing).toHaveBeenCalledOnce();
    expect(props.onError).toHaveBeenCalledWith(
      "photo",
      expect.objectContaining({ missing: true })
    );
  });

  it("releases the image and its GPU composer on unmount", async () => {
    const { unmount } = setup();
    await act(async () => {});
    act(() => scene.options!.onBeforeRender?.(geometry(), renderer));
    const contentRef = scene.options!.contentRef!;
    unmount();
    expect(streaming.released).toBe(1);
    expect(streaming.disposed).toBe(1);
    expect(contentRef.current).toBeNull();
  });

  it("draws the same tiles into the DOM canvas without a shared scene", async () => {
    scene.enabled = false;
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue({} as never);
    const { handlers } = setup();
    await act(async () => {});
    act(() => handlers.get("render")?.());
    expect(streaming.drawn).toBe(1);
    expect(streaming.rendered).toHaveLength(0);
    getContext.mockRestore();
  });
});

describe("native preview flight preparation", () => {
  it("acquires a hidden destination immediately and preserves its seeded crop during flight", async () => {
    const adapter = await import("./utils/native-preview-pool");
    const source = adapter.nativePreviewSource({ imageId: "photo", sourceUrl: "https://imagery.test/2026/photo.avif",
      avifPyramidUrl: "https://imagery.test/2026/photo.avif", avifOnly: true,
      nativeSize: { width: 10652 as DevicePixels, height: 14204 as DevicePixels } });
    const forecast = adapter.fitNativePreviewView(source, 800, 600, 0, 2);
    adapter.rememberNativePreviewView(source, forecast.view, forecast.pixels);
    const view = setup({ dimImage: true }); await act(async () => {});
    expect(streaming.sources).toHaveLength(1);
    expect(streaming.views).toEqual([forecast.view]);
    act(() => scene.options!.onBeforeRender?.(geometry(100), renderer));
    expect(streaming.views).toEqual([forecast.view]);
    expect(streaming.rendered).toHaveLength(0);
    view.rerender(<NativePixels {...view.props} dimImage={false} />);
    act(() => scene.options!.onBeforeRender?.(geometry(100), renderer));
    expect(streaming.sources).toHaveLength(1);
    expect(streaming.released).toBe(0);
    expect(streaming.rendered).toHaveLength(1);
    expect(streaming.views).toHaveLength(2);
  });
});
