import { act, cleanup, render } from "@testing-library/react";
import type { ComponentProps } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CssPixels, DevicePixels, Ratio } from "@carma-units";
import type { NativePreviewWindow } from "../core/utils/native-preview-window";
import type {
  ScenePreviewImageGeometry,
  useScenePreviewImage,
} from "./hooks/useScenePreviewImage";

type SceneOptions = Parameters<typeof useScenePreviewImage>[0];
const scene = vi.hoisted(() => ({
  options: null as SceneOptions | null,
  enabled: true,
  renders: vi.fn(),
}));
vi.mock("./hooks/useScenePreviewImage", () => ({
  useScenePreviewImage: (options: SceneOptions) => {
    scene.options = options;
    scene.renders(options);
    return scene.enabled;
  },
}));
const whole = vi.hoisted(() => ({
  thumbnail: null as { bitmap: ImageBitmap; blobUrl: string } | null,
  readThumbnail: vi.fn(),
}));
vi.mock("./hooks/usePrefetchedPreviewThumbnail", () => ({
  usePrefetchedPreviewThumbnail: (...args: unknown[]) => {
    whole.readThumbnail(...args);
    return whole.thumbnail;
  },
}));
vi.mock("./hooks/useProgressivePreviewSource", () => ({
  useProgressivePreviewSource: () => null,
}));
vi.mock("./hooks/usePreviewSizeSync", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./hooks/usePreviewSizeSync")>()),
  usePreviewSizeSync: () => {},
}));
vi.mock("./ObliqueImagePreview.Backdrop", () => ({ Backdrop: () => null }));
vi.mock("./ObliqueImagePreview.PreviewImage", () => ({
  PreviewImage: ({ children }: { children?: import("react").ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("./utils/cameraMath", () => ({
  readCameraToCenterDistancePx: () => 400,
}));

type Request = {
  url: string;
  generation: number;
  tiff: boolean;
  flipForTexture: boolean;
  window: NativePreviewWindow;
  imageId: string;
  sourceIdentity: string;
  retainWholeImage: boolean;
  activeSourceByteLimit: number;
  reusePublished: boolean;
};
type Control = { cancel: true; park?: true; retainedSourceByteLimit?: number };
type Response = {
  kind?: "full-image" | "source-memory";
  imageId?: string;
  sourceIdentity?: string;
  sourceUrl?: string;
  sourceResidentBytes?: number;
  reusePublished?: boolean;
  bitmap?: ImageBitmap;
  error?: string;
  missing?: boolean;
  generation?: number;
  sourceWidth?: number;
  sourceHeight?: number;
  crop?: NativePreviewWindow["source"];
  sampleDensity?: number;
  complete?: boolean;
  sourceBackend?: string;
  containsTiffDecoder?: boolean;
};
const workers: FakeWorker[] = [];
class FakeWorker {
  onmessage: ((event: MessageEvent<Response>) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  postMessage = vi.fn((_message: Request | Control) => {});
  terminate = vi.fn();
  constructor() {
    workers.push(this);
  }
  get requests(): Request[] {
    return this.postMessage.mock.calls
      .map(([message]) => message)
      .filter((message): message is Request => "url" in message);
  }
  reply(data: Response) {
    this.onmessage?.({ data } as MessageEvent<Response>);
  }
}
let NativePixels: typeof import("./ObliqueImagePreview.NativePixels").NativePixels;
const geometry = (x = 0): ScenePreviewImageGeometry => ({
  viewport: { width: 800 as CssPixels, height: 600 as CssPixels },
  image: { width: 1200 as CssPixels, height: 1600 as CssPixels },
  offset: { x: x as CssPixels, y: 0 as CssPixels },
  pixelRatio: 2 as Ratio,
});
const bitmap = () =>
  ({ width: 1600, height: 1200, close: vi.fn() } as unknown as ImageBitmap);
const beforeRender = (frame = geometry()) =>
  act(() => scene.options!.onBeforeRender?.(frame));
const rest = () => act(() => vi.advanceTimersByTime(200));
const content = () => scene.options!.contentRef!.current;
const complete = (worker: FakeWorker, result?: ImageBitmap) => {
  const request = worker.requests.at(-1)!;
  result ??= {
    width: request.window.target.width,
    height: request.window.target.height,
    close: vi.fn(),
  } as unknown as ImageBitmap;
  act(() =>
    worker.reply({
      bitmap: result,
      generation: request.generation,
      sourceWidth: 5326,
      sourceHeight: 7102,
    })
  );
  return result;
};
const setup = (
  imageId = "photo",
  overrides: Partial<ComponentProps<typeof NativePixels>> = {}
) => {
  const map = {
    on: vi.fn(),
    off: vi.fn(),
    triggerRepaint: vi.fn(),
    isMoving: vi.fn(() => false),
    transform: { width: 800, height: 600, centerOffset: { x: 0, y: 0 } },
  } as unknown as MaplibreMap;
  const props: ComponentProps<typeof NativePixels> = {
    map,
    rootRef: { current: document.createElement("div") },
    path: "/images",
    imageId,
    nativeSize: { width: 10652 as DevicePixels, height: 14204 as DevicePixels },
    halfFovTan: 0.5,
    principal: { xOffset: 0, yOffset: 0 },
    rollDeg: 0,
    dimImage: false,
    sourceUrl: "https://imagery.test/3/" + imageId + ".jpg",
    onSourceLoaded: vi.fn(),
    ...overrides,
  };
  const view = render(<NativePixels {...props} />);
  return { ...view, props, map };
};
beforeEach(async () => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.resetModules();
  workers.length = 0;
  scene.options = null;
  scene.enabled = true;
  whole.thumbnail = null;
  vi.stubGlobal("Worker", FakeWorker);
  vi.stubGlobal("OffscreenCanvas", class {});
  NativePixels = (await import("./ObliqueImagePreview.NativePixels"))
    .NativePixels;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("worker-composed preview pixels", () => {
  it("coalesces geometry requests and reuses one worker and one metadata notification per source URL", () => {
    const view = setup();
    beforeRender();
    const worker = workers[0];
    expect(worker.requests).toHaveLength(1);
    act(() => vi.advanceTimersByTime(100));
    beforeRender(geometry(80));
    act(() => vi.advanceTimersByTime(100));
    expect(worker.requests).toHaveLength(1);
    act(() => vi.advanceTimersByTime(100));
    expect(worker.requests).toHaveLength(2);
    const renders = scene.renders.mock.calls.length;
    complete(worker);
    expect(content()?.source).toBeDefined();
    expect(scene.renders).toHaveBeenCalledTimes(renders);
    expect(view.props.onSourceLoaded).toHaveBeenCalledOnce();
    expect(view.props.onSourceLoaded).toHaveBeenCalledWith(
      view.props.sourceUrl,
      5326,
      7102
    );
    beforeRender(geometry(140));
    rest();
    complete(worker);
    expect(workers).toHaveLength(1);
    expect(worker.requests).toHaveLength(3);
    expect(worker.terminate).not.toHaveBeenCalled();
    expect(view.props.onSourceLoaded).toHaveBeenCalledOnce();
    expect(scene.renders).toHaveBeenCalledTimes(renders);
  });

  it("sends at most one cancel per outstanding RPC during sustained moving frames", () => {
    const view = setup("cancel-storm");
    beforeRender();
    const worker = workers[0];
    const cancellations = () =>
      worker.postMessage.mock.calls.filter(
        ([message]) => "cancel" in message && message.cancel && !message.park
      ).length;
    expect(worker.requests).toHaveLength(1);
    vi.mocked(view.map.isMoving).mockReturnValue(true);
    for (let index = 1; index <= 120; index++) {
      beforeRender(geometry(index));
      act(() => vi.advanceTimersByTime(16));
    }
    expect(cancellations()).toBe(1);
    expect(worker.requests).toHaveLength(1);
    rest();
    expect(cancellations()).toBe(1);
    expect(worker.requests).toHaveLength(1);
    vi.mocked(view.map.isMoving).mockReturnValue(false);
    rest();
    expect(worker.requests).toHaveLength(2);
    const request = worker.requests.at(-1)!;
    const partial = {
      width: request.window.target.width,
      height: request.window.target.height,
      close: vi.fn(),
    } as unknown as ImageBitmap;
    act(() =>
      worker.reply({
        bitmap: partial,
        generation: request.generation,
        sourceWidth: 5326,
        sourceHeight: 7102,
        complete: false,
      })
    );
    // A progressive first stage keeps its foreground request outstanding.
    vi.mocked(view.map.isMoving).mockReturnValue(true);
    for (let index = 180; index < 300; index++) {
      beforeRender(geometry(index));
      act(() => vi.advanceTimersByTime(16));
    }
    expect(cancellations()).toBe(2);
    expect(worker.requests).toHaveLength(2);
    vi.mocked(view.map.isMoving).mockReturnValue(false);
    rest();
    expect(worker.requests).toHaveLength(3);
    act(() =>
      worker.reply({
        generation: worker.requests.at(-1)!.generation,
        reusePublished: true,
      })
    );
    // Reuse is terminal: later geometry/timer changes need no cancel message.
    beforeRender(geometry(350));
    beforeRender(geometry(360));
    expect(cancellations()).toBe(2);
    expect(worker.terminate).not.toHaveBeenCalled();
  });

  it("keeps covered zooms uniform-only without a cancel, bitmap request or React update", () => {
    setup("covered", { avifPyramidUrl: "https://imagery.test/covered.avif" });
    const initialGeometry = {
      ...geometry(),
      image: {
        width: 1000 as CssPixels,
        height: ((1000 * 14204) / 10652) as CssPixels,
      },
      pixelRatio: 4 as Ratio,
    };
    beforeRender(initialGeometry);
    const worker = workers[0],
      request = worker.requests[0];
    const pixels = {
      width: request.window.target.width,
      height: request.window.target.height,
      close: vi.fn(),
    } as unknown as ImageBitmap;
    act(() =>
      worker.reply({
        bitmap: pixels,
        generation: request.generation,
        sourceWidth: 5326,
        sourceHeight: 7102,
        sourceBackend: "avif-pyramid",
      })
    );
    const messages = worker.postMessage.mock.calls.length;
    const renders = scene.renders.mock.calls.length;
    const movementStart = vi
      .mocked(scene.options!.map.on)
      .mock.calls.find(([name]) => name === "movestart")![1] as () => void;
    act(() => movementStart());
    beforeRender(geometry());
    beforeRender({
      ...geometry(),
      image: {
        width: 1100 as CssPixels,
        height: ((1100 * 14204) / 10652) as CssPixels,
      },
    });
    rest();
    expect(worker.postMessage).toHaveBeenCalledTimes(messages);
    expect(worker.requests).toHaveLength(1);
    expect(content()?.source).toBe(pixels);
    expect(pixels.close).not.toHaveBeenCalled();
    expect(scene.renders).toHaveBeenCalledTimes(renders);
    // Exposing pixels outside that admitted crop still queues a bounded refinement.
    beforeRender({
      ...geometry(),
      image: {
        width: 800 as CssPixels,
        height: ((800 * 14204) / 10652) as CssPixels,
      },
    });
    expect(worker.requests).toHaveLength(1);
    rest();
    expect(worker.requests).toHaveLength(2);
  });

  it("accepts a bounded whole-image fallback across motion epochs and rejects foreign identities", () => {
    const onFullImage = vi.fn();
    setup("full", {
      retainWholeImage: true,
      onFullImage,
      avifPyramidUrl: "https://imagery.test/full.avif",
    });
    beforeRender();
    const worker = workers[0],
      first = worker.requests[0];
    const sharp = complete(worker);
    beforeRender(geometry(40));
    const full = {
      width: 640,
      height: 853,
      close: vi.fn(),
    } as unknown as ImageBitmap;
    const response = {
      kind: "full-image" as const,
      bitmap: full,
      imageId: first.imageId,
      sourceIdentity: first.sourceIdentity,
      sourceUrl: first.url,
      generation: first.generation,
      sourceBackend: "avif-pyramid",
      crop: {
        x: 0 as DevicePixels,
        y: 0 as DevicePixels,
        width: 10652 as DevicePixels,
        height: 14204 as DevicePixels,
      },
      sampleDensity: 0.03125,
    };
    act(() => worker.reply(response));
    expect(onFullImage).toHaveBeenCalledWith(full);
    expect(content()?.source).toBe(sharp);
    expect(full.close).not.toHaveBeenCalled();
    const foreign = bitmap();
    act(() =>
      worker.reply({ ...response, bitmap: foreign, imageId: "another-photo" })
    );
    expect(foreign.close).toHaveBeenCalledOnce();
    const oversized = {
      width: 4096,
      height: 4096,
      close: vi.fn(),
    } as unknown as ImageBitmap;
    act(() => worker.reply({ ...response, bitmap: oversized }));
    expect(oversized.close).toHaveBeenCalledOnce();
    expect(onFullImage).toHaveBeenCalledOnce();
  });

  it("accounts actual source residency instead of the active cap and accepts no-bitmap reuse", () => {
    const parked = setup("parked");
    beforeRender();
    complete(workers[0]);
    parked.unmount();
    const onError = vi.fn();
    setup("active", {
      retainWholeImage: true,
      onError,
      avifPyramidUrl: "https://imagery.test/active.avif",
    });
    beforeRender();
    const worker = workers[1],
      request = worker.requests[0];
    expect(request).toMatchObject({
      retainWholeImage: true,
      activeSourceByteLimit: 768 * 1024 * 1024,
    });
    expect(workers[0].terminate).not.toHaveBeenCalled();
    const sharp = complete(worker);
    beforeRender(geometry(100));
    rest();
    const next = worker.requests.at(-1)!;
    expect(next.reusePublished).toBe(true);
    act(() =>
      worker.reply({
        generation: next.generation,
        reusePublished: true,
        sourceResidentBytes: 1024,
      })
    );
    expect(content()?.source).toBe(sharp);
    expect(onError).not.toHaveBeenCalled();
    act(() =>
      worker.reply({
        kind: "source-memory",
        imageId: request.imageId,
        sourceIdentity: request.sourceIdentity,
        sourceResidentBytes: 300 * 1024 * 1024,
      })
    );
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    act(() => vi.advanceTimersByTime(90001));
    expect(worker.terminate).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("keeps the old bitmap throughout a source-level change until its replacement arrives", () => {
    const view = setup();
    const frame = geometry();
    beforeRender(frame);
    rest();
    const worker = workers[0],
      previous = complete(worker);
    const sourceUrl = "https://imagery.test/1/photo.jpg";
    view.rerender(<NativePixels {...view.props} sourceUrl={sourceUrl} />);
    expect(content()?.source).toBe(previous);
    expect(previous.close).not.toHaveBeenCalled();
    beforeRender(frame);
    rest();
    expect(worker.requests.at(-1)?.url).toBe(sourceUrl);
    expect(content()?.source).toBe(previous);
    const next = complete(worker);
    expect(content()?.source).toBe(next);
    expect(previous.close).toHaveBeenCalledOnce();
    expect(view.props.onSourceLoaded).toHaveBeenCalledTimes(2);
    beforeRender(geometry(30));
    rest();
    complete(worker);
    expect(view.props.onSourceLoaded).toHaveBeenCalledTimes(2);
    expect(workers).toHaveLength(1);
  });

  it("closes stale generation and old-URL replies without publishing content or metadata", () => {
    const view = setup();
    beforeRender();
    rest();
    const worker = workers[0],
      first = worker.requests[0];
    const oldHandler = worker.onmessage!;
    beforeRender(geometry(40));
    const stale = bitmap();
    act(() =>
      oldHandler({
        data: {
          bitmap: stale,
          generation: first.generation,
          sourceWidth: 10,
          sourceHeight: 10,
        },
      } as MessageEvent<Response>)
    );
    expect(stale.close).toHaveBeenCalledOnce();
    expect(content()).toBeNull();
    expect(view.props.onSourceLoaded).not.toHaveBeenCalled();
    rest();
    const wrongGeneration = bitmap();
    act(() =>
      worker.reply({
        bitmap: wrongGeneration,
        generation: first.generation,
        sourceWidth: 10,
        sourceHeight: 10,
      })
    );
    expect(wrongGeneration.close).toHaveBeenCalledOnce();
    const accepted = complete(worker);
    view.rerender(
      <NativePixels
        {...view.props}
        sourceUrl="https://imagery.test/2/photo.jpg"
      />
    );
    const renders = scene.renders.mock.calls.length,
      staleUrl = bitmap();
    act(() =>
      worker.reply({
        bitmap: staleUrl,
        generation: worker.requests.at(-1)!.generation,
        sourceWidth: 10,
        sourceHeight: 10,
      })
    );
    expect(staleUrl.close).toHaveBeenCalledOnce();
    expect(content()?.source).toBe(accepted);
    expect(view.props.onSourceLoaded).toHaveBeenCalledOnce();
    expect(scene.renders).toHaveBeenCalledTimes(renders);
  });

  it("parks and cancels on unmount, closes late bitmaps and cancels deferred jobs", () => {
    const view = setup();
    beforeRender();
    rest();
    const worker = workers[0],
      published = complete(worker);
    beforeRender(geometry(60));
    const requests = worker.requests.length;
    view.unmount();
    expect(worker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        cancel: true,
        park: true,
        retainedSourceByteLimit: expect.any(Number),
      })
    );
    const parked = worker.postMessage.mock.calls
      .map(([message]) => message)
      .find(
        (message): message is Control =>
          "park" in message && message.park === true
      )!;
    expect(parked.retainedSourceByteLimit).toBeGreaterThan(0);
    expect(parked.retainedSourceByteLimit).toBeLessThanOrEqual(
      256 * 1024 * 1024
    );
    expect(worker.terminate).not.toHaveBeenCalled();
    expect(published.close).not.toHaveBeenCalled();
    const late = bitmap();
    worker.reply({ bitmap: late });
    expect(late.close).toHaveBeenCalledOnce();
    act(() => vi.advanceTimersByTime(1000));
    expect(worker.requests).toHaveLength(requests);
    expect(content()).toBeNull();
  });

  it("reacquires a parked image worker after changing the visible photo", () => {
    const first = setup("north");
    beforeRender();
    rest();
    const north = workers[0];
    complete(north);
    first.unmount();
    const second = setup("east");
    beforeRender();
    rest();
    complete(workers[1]);
    second.unmount();
    const restored = setup("north");
    beforeRender();
    rest();
    expect(workers).toHaveLength(2);
    expect(north.requests).toHaveLength(1);
    expect(north.terminate).not.toHaveBeenCalled();
    const outdated = bitmap();
    act(() =>
      north.reply({
        bitmap: outdated,
        generation: north.requests[0].generation,
        sourceWidth: 10,
        sourceHeight: 10,
      })
    );
    expect(outdated.close).toHaveBeenCalledOnce();
    expect(content()?.source).toBeDefined();
    expect(restored.props.onSourceLoaded).toHaveBeenCalledOnce();
    complete(north);
    expect(restored.props.onSourceLoaded).toHaveBeenCalledOnce();
  });

  it("keeps the incoming first photo through four directions and restores sharp pixels before any worker request", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true }))
    );
    const frames = new Map<string, ImageBitmap>();
    for (const id of ["north", "east", "south", "west"]) {
      const view = setup(id);
      beforeRender();
      rest();
      frames.set(id, complete(workers.at(-1)!));
      view.unmount();
    }
    expect(workers).toHaveLength(4);
    expect(
      workers.every((worker) => worker.terminate.mock.calls.length === 0)
    ).toBe(true);
    const restored = setup("north");
    expect(content()?.source).toBe(frames.get("north"));
    expect(restored.props.onSourceLoaded).toHaveBeenCalledOnce();
    expect(workers[0].requests).toHaveLength(1);
    expect(
      frames.get("north")!.close as ReturnType<typeof vi.fn>
    ).not.toHaveBeenCalled();
    beforeRender();
    rest();
    expect(workers).toHaveLength(4);
    expect(workers[0].requests).toHaveLength(1);
    restored.unmount();
  });
  it("evicts by count and closes the owned bitmap after the small-device four-entry limit", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true }))
    );
    let first: ImageBitmap;
    for (const id of ["north", "east", "south", "west", "extra"]) {
      const view = setup(id);
      beforeRender();
      rest();
      const image = complete(workers.at(-1)!);
      if (id === "north") first = image;
      view.unmount();
    }
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    expect(first!.close).toHaveBeenCalledOnce();
    expect(
      workers.slice(1).every((worker) => !worker.terminate.mock.calls.length)
    ).toBe(true);
  });
  it("evicts raster-heavy entries by bytes before reaching the desktop count limit", () => {
    const largeGeometry = {
      ...geometry(),
      viewport: { width: 2048 as CssPixels, height: 2048 as CssPixels },
      image: {
        width: 5000 as CssPixels,
        height: ((5000 * 14204) / 10652) as CssPixels,
      },
    };
    const first = setup("large-a");
    beforeRender(largeGeometry);
    rest();
    const pixels = {
      width: 4096,
      height: 4096,
      close: vi.fn(),
    } as unknown as ImageBitmap;
    complete(workers[0], pixels);
    first.unmount();
    const next = setup("large-b");
    beforeRender(largeGeometry);
    rest();
    complete(workers[1], {
      width: 4096,
      height: 4096,
      close: vi.fn(),
    } as unknown as ImageBitmap);
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    expect(pixels.close).toHaveBeenCalledOnce();
    expect(workers).toHaveLength(2);
    next.unmount();
  });
  it("retains a valid partial ROI and rejects a lower-resolution replacement without a late timeout", () => {
    const first = setup("north");
    beforeRender();
    rest();
    const sharp = bitmap(),
      request = workers[0].requests.at(-1)!;
    act(() =>
      workers[0].reply({
        bitmap: sharp,
        generation: request.generation,
        crop: request.window.source,
        sampleDensity: 0.2,
        complete: false,
        sourceWidth: 5326,
        sourceHeight: 7102,
      })
    );
    first.unmount();
    const restored = setup("north");
    expect(content()?.source).toBe(sharp);
    beforeRender(geometry(0.001));
    rest();
    const coarse = bitmap(),
      next = workers[0].requests.at(-1)!;
    act(() =>
      workers[0].reply({
        bitmap: coarse,
        generation: next.generation,
        crop: next.window.source,
        sampleDensity: 0.05,
        complete: false,
      })
    );
    expect(coarse.close).toHaveBeenCalledOnce();
    expect(content()?.source).toBe(sharp);
    act(() => vi.advanceTimersByTime(90001));
    expect(workers[0].terminate).not.toHaveBeenCalled();
    expect(restored.props.onError).toBeUndefined();
  });
  it("uses the response's actual crop for retained pixels and guards different original URLs", () => {
    const first = setup("same", { path: undefined });
    beforeRender();
    rest();
    const frame = workers[0].requests.at(-1)!;
    const crop = {
      ...frame.window.source,
      x: (frame.window.source.x + 1) as DevicePixels,
    };
    act(() =>
      workers[0].reply({
        bitmap: bitmap(),
        generation: frame.generation,
        crop,
        complete: true,
      })
    );
    expect(content()?.crop).toEqual(crop);
    first.unmount();
    const other = setup("same", {
      path: undefined,
      sourceUrl: "https://other.test/3/same.jpg",
    });
    expect(content()).toBeNull();
    beforeRender();
    rest();
    expect(workers).toHaveLength(2);
    other.unmount();
  });
  it("forwards AVIF-only and does not replay a previously cached legacy composition under that policy", () => {
    const first = setup("policy", {
      avifPyramidUrl: "https://imagery.test/policy.avif",
    });
    beforeRender();
    rest();
    complete(workers[0]);
    first.unmount();
    const strict = setup("policy", {
      avifOnly: true,
      avifPyramidUrl: "https://imagery.test/policy.avif",
    });
    expect(content()).toBeNull();
    beforeRender();
    rest();
    expect(
      workers[1].postMessage.mock.calls.some(
        ([value]) =>
          "url" in value &&
          (value as Request & { avifOnly?: boolean }).avifOnly === true
      )
    ).toBe(true);
    strict.unmount();
  });
  it("releases a possibly TIFF-backed pending worker before the first backend-confirming bitmap", () => {
    const first = setup("pending", {
      tiff: true,
      sourceUrl: "https://imagery.test/pending.tif",
      avifPyramidUrl: "https://imagery.test/pending.avif",
    });
    beforeRender();
    rest();
    const pending = workers[0];
    first.unmount();
    expect(pending.terminate).toHaveBeenCalledOnce();
    const next = setup("pending", {
      tiff: true,
      sourceUrl: "https://imagery.test/pending.tif",
      avifPyramidUrl: "https://imagery.test/pending.avif",
    });
    beforeRender();
    rest();
    expect(workers).toHaveLength(2);
    expect(workers[1]).not.toBe(pending);
    next.unmount();
  });
  it("retains the DOM fallback bitmap while releasing the parked TIFF decoder worker", () => {
    scene.enabled = false;
    const context = { drawImage: vi.fn() };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      context as unknown as CanvasRenderingContext2D
    );
    const first = setup("dom", {
      tiff: true,
      sourceUrl: "https://imagery.test/dom.tif",
    });
    beforeRender();
    rest();
    const image = complete(workers[0]);
    first.unmount();
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    expect(image.close).not.toHaveBeenCalled();
    const count = context.drawImage.mock.calls.length;
    setup("dom", { tiff: true, sourceUrl: "https://imagery.test/dom.tif" });
    expect(context.drawImage).toHaveBeenCalledTimes(count + 1);
    expect(workers).toHaveLength(2);
  });
  it("requests TIFF windows immediately and accepts one sharper replacement in the same worker", () => {
    const view = setup("original", {
      sourceUrl: "https://imagery.test/original.tif",
      tiff: true,
    });
    beforeRender();
    rest();
    const worker = workers[0];
    expect(worker.requests[0]).toMatchObject({
      url: "https://imagery.test/original.tif",
      tiff: true,
      flipForTexture: true,
    });
    const pixels = complete(worker);
    expect(content()?.source).toBe(pixels);
    expect(worker.terminate).not.toHaveBeenCalled();
    const sharper = complete(worker);
    expect(content()?.source).toBe(sharper);
    expect(pixels.close).toHaveBeenCalledOnce();
    expect(view.props.onSourceLoaded).toHaveBeenCalledOnce();
    view.unmount();
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(sharper.close).not.toHaveBeenCalled();
  });
});

it("avoids a foreground worker after a known missing hover and resumes after expiry", async () => {
  const cache = await import("./utils/preview-thumbnail-cache");
  const source = {
    previewPath: "/images",
    imageId: "later",
    avifPyramidUrl: "https://imagery.test/later.avif",
    avifOnly: true,
  };
  cache.reportPreviewSourceMissing(source);
  const onError = vi.fn();
  const view = setup("later", { ...source, onError });
  beforeRender();
  rest();
  expect(workers).toHaveLength(0);
  expect(onError).toHaveBeenCalledWith(
    "later",
    expect.objectContaining({ missing: true })
  );
  act(() => vi.advanceTimersByTime(15000));
  rest();
  expect(workers).toHaveLength(1);
  complete(workers[0]);
  expect(view.props.onSourceLoaded).toHaveBeenCalledOnce();
  expect(cache.isPreviewSourceMissing(source)).toBe(false);
  act(() => vi.advanceTimersByTime(15000));
  expect(workers[0].requests).toHaveLength(1);
  view.unmount();
  cache.disposePreviewThumbnailPrefetch();
});

it("retries a visible worker 404 once at cache expiry without requiring movement", async () => {
  const cache = await import("./utils/preview-thumbnail-cache");
  const source = {
    previewPath: "/images",
    imageId: "arriving",
    avifPyramidUrl: "https://imagery.test/arriving.avif",
    avifOnly: true,
  };
  const view = setup("arriving", { ...source, onError: vi.fn() });
  beforeRender();
  rest();
  const first = workers[0];
  act(() =>
    first.reply({
      generation: first.requests[0].generation,
      error: "AVIF requires HTTP 206; refusing 404 full-file response",
      missing: true,
    })
  );
  expect(cache.isPreviewSourceMissing(source)).toBe(true);
  act(() => vi.advanceTimersByTime(15000));
  rest();
  expect(workers).toHaveLength(2);
  complete(workers[1]);
  expect(view.props.onSourceLoaded).toHaveBeenCalledOnce();
  view.unmount();
  act(() => vi.advanceTimersByTime(30000));
  expect(workers).toHaveLength(2);
  cache.disposePreviewThumbnailPrefetch();
});

describe("whole-photo fallback under a native ROI", () => {
  it("retains the complete thumbnail after ROI metadata and zoomout, then replaces it with an owned bounded full bitmap", async () => {
    const { ObliqueImagePreview } = await import("./ObliqueImagePreview");
    const thumbnail = {
      width: 100,
      height: 150,
      close: vi.fn(),
    } as unknown as ImageBitmap;
    whole.thumbnail = { bitmap: thumbnail, blobUrl: "blob:thumbnail" };
    const base = setup("unused");
    base.unmount();
    const props: ComponentProps<typeof ObliqueImagePreview> = {
      map: base.map,
      previewPath: "/images",
      imageId: "fallback",
      avifPyramidUrl: "https://imagery.test/fallback.avif",
      avifOnly: true,
      nativePixelSize: base.props.nativeSize,
      halfFovTan: 30,
      qualityLevel: "0",
      dimImage: false,
      rollDeg: 0,
      backdropLook: { contrast: 100, brightness: 100, saturation: 100 },
    };
    const view = render(<ObliqueImagePreview {...props} />);
    const baseOptions = () =>
      scene.renders.mock.calls
        .map(([options]) => options)
        .filter((options) => options.priority === undefined)
        .at(-1)!;
    expect(baseOptions().contentRef?.current?.source).toBe(thumbnail);
    expect(whole.readThumbnail.mock.lastCall?.[2]).toBe(false);
    beforeRender();
    const worker = workers.at(-1)!;
    complete(worker);
    expect(whole.readThumbnail.mock.lastCall?.[2]).toBe(false);
    expect(baseOptions().contentRef?.current?.source).toBe(thumbnail);
    expect(worker.requests[0].retainWholeImage).toBe(true);
    const full = {
      width: 640,
      height: 853,
      close: vi.fn(),
    } as unknown as ImageBitmap;
    const request = worker.requests[0];
    act(() =>
      worker.reply({
        kind: "full-image",
        bitmap: full,
        imageId: request.imageId,
        sourceIdentity: request.sourceIdentity,
        sourceUrl: request.url,
        generation: request.generation,
      })
    );
    expect(baseOptions().contentRef?.current?.source).toBe(full);
    expect(whole.readThumbnail.mock.lastCall?.[2]).toBe(true);
    view.rerender(<ObliqueImagePreview {...props} halfFovTan={40} />);
    expect(baseOptions().contentRef?.current?.source).toBe(full);
    view.unmount();
    expect(full.close).toHaveBeenCalledOnce();
  });
});
