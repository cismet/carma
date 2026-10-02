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
  renders: vi.fn(),
}));
vi.mock("./hooks/useScenePreviewImage", () => ({
  useScenePreviewImage: (options: SceneOptions) => {
    scene.options = options;
    scene.renders(options);
    return true;
  },
}));
vi.mock("./utils/cameraMath", () => ({
  readCameraToCenterDistancePx: () => 400,
}));

type Request = {
  url: string;
  generation: number;
  wholeImage: boolean;
  flipForTexture: boolean;
  window: NativePreviewWindow;
};
type Control = { cancel: true; park?: true; retainedSourceByteLimit?: number };
type Response = {
  bitmap?: ImageBitmap;
  error?: string;
  generation?: number;
  sourceWidth?: number;
  sourceHeight?: number;
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
const complete = (worker: FakeWorker, result = bitmap()) => {
  const request = worker.requests.at(-1)!;
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
  vi.stubGlobal("Worker", FakeWorker);
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
    act(() => vi.advanceTimersByTime(100));
    beforeRender(geometry(80));
    act(() => vi.advanceTimersByTime(100));
    expect(workers).toHaveLength(0);
    act(() => vi.advanceTimersByTime(100));
    const worker = workers[0];
    expect(worker.requests).toHaveLength(1);
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
    expect(worker.requests).toHaveLength(2);
    expect(worker.terminate).not.toHaveBeenCalled();
    expect(view.props.onSourceLoaded).toHaveBeenCalledOnce();
    expect(scene.renders).toHaveBeenCalledTimes(renders);
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
    expect(published.close).toHaveBeenCalledOnce();
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
    expect(north.requests).toHaveLength(2);
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
    expect(content()).toBeNull();
    expect(restored.props.onSourceLoaded).not.toHaveBeenCalled();
    complete(north);
    expect(restored.props.onSourceLoaded).toHaveBeenCalledOnce();
  });

  it("keeps three parked compositions plus the visible worker and evicts the oldest parked image", () => {
    for (const id of ["north", "east", "south"]) {
      const view = setup(id);
      beforeRender();
      rest();
      complete(workers.at(-1)!);
      view.unmount();
    }
    const fourth = setup("west");
    beforeRender();
    rest();
    expect(workers).toHaveLength(4);
    expect(
      workers.every((worker) => worker.terminate.mock.calls.length === 0)
    ).toBe(true);
    fourth.unmount();
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    expect(
      workers
        .slice(1)
        .every((worker) => worker.terminate.mock.calls.length === 0)
    ).toBe(true);
    const restored = setup("east");
    beforeRender();
    rest();
    expect(workers).toHaveLength(4);
    expect(workers[1].requests).toHaveLength(2);
    restored.unmount();
    const evicted = setup("north");
    beforeRender();
    rest();
    expect(workers).toHaveLength(5);
    expect(workers[4]).not.toBe(workers[0]);
    evicted.unmount();
  });

  it("retains the original-PNG worker's termination behavior", () => {
    const view = setup("original", { sourceUrl: undefined, path: "/native" });
    beforeRender();
    rest();
    const worker = workers[0];
    expect(worker.requests[0]).toMatchObject({
      url: new URL("/native/original.png", window.location.href).href,
      wholeImage: false,
      flipForTexture: true,
    });
    const pixels = complete(worker);
    expect(content()?.source).toBe(pixels);
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(view.props.onSourceLoaded).not.toHaveBeenCalled();
    view.unmount();
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(pixels.close).toHaveBeenCalledOnce();
  });
});
