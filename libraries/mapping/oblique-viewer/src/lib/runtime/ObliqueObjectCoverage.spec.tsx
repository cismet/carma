import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DoubleSide,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Raycaster,
  Vector3,
} from "three";
import type { Map as MaplibreMap } from "maplibre-gl";
import type {
  ObliqueCameraCalibration,
  ObliqueDataset,
  ObliqueImageRecord,
  ObliquePose,
} from "../core/types";
import type {
  ObjectCoverageGroups,
  ObjectCoverageImage,
  ObjectCoverageSphere,
} from "../core/utils/object-coverage";
import {
  imageProjectionMatrix,
  sceneToPhotoEnu,
} from "../core/utils/image-projection";
import { ObliqueObjectCoverage } from "./ObliqueObjectCoverage";
import { ImageViewportPool, type ImageViewportHandle, type ImageViewportSnapshot, type ImageViewportSource } from "@carma-commons/image-pyramid";

const scene = vi.hoisted(() => ({
  acquire: vi.fn(),
  runtimes: vi.fn(),
  release: vi.fn(),
}));
vi.mock("@carma-mapping/engines/maplibre", () => ({
  acquireSharedThreeScene: scene.acquire,
  getSharedThreeSceneRuntimes: scene.runtimes,
}));
vi.mock("./hooks/useProgressivePreviewSource", () => ({
  useProgressivePreviewSource: () => null,
}));
vi.mock("antd", () => ({
  Button: ({ children, icon, size: _size, type: _type, ...props }: any) => (
    <button {...props}>{icon}{children}</button>
  ),
  Tooltip: ({ children }: any) => children,
}));

type Response = {
  generation?: number;
  bitmap?: ImageBitmap;
  complete?: boolean;
  error?: string;
};
class Worker {
  static instances: Worker[] = [];
  onmessage: ((event: MessageEvent<Response>) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor(readonly url: URL) {
    Worker.instances.push(this);
  }
  reply(value: Response) {
    act(() => this.onmessage?.({ data: value } as MessageEvent<Response>));
  }
}
const calibration: ObliqueCameraCalibration = {
  widthPx: 2000,
  heightPx: 1000,
  focalLengthMm: 100,
  principalPointPx: [999.5, 499.5],
  halfFovTan: 1,
  upMapping: { rowIndex: 1, negate: false },
};
const pose: ObliquePose = {
  longitude: 7.2,
  latitude: 51.27,
  z: 100,
  bearingDeg: 0,
  pitchDeg: 0,
  rollDeg: 0,
  direction: [0, 0, -1],
  up: [0, 1, 0],
  convergenceRad: 0,
};
const dataset = {
  id: "2024",
  label: "04/2024",
  shortLabel: "2024",
  previewPath: "/images",
  cameras: { test: calibration },
  minimumPreviewQualityLevel: "1",
  heightDatum: "ellipsoidal",
} as unknown as ObliqueDataset;
const imageOf = (
  id: string,
  crop: ObjectCoverageImage["crop"] = {
    x: 949,
    y: 449,
    width: 102,
    height: 102,
  }
): ObjectCoverageImage => {
  const record = {
    id: "2024:" + id,
    seriesId: "2024",
    sourceId: id,
    cameraId: "test",
    x: 0,
    y: 0,
    z: 100,
    centerWGS84: [7.2, 51.27, 100],
    m: [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ],
    fallbackHeadingDeg: 0,
    sectorIndex: 0,
    pose,
  } as ObliqueImageRecord;
  return {
    record,
    dataset,
    crop,
    cameraAltitudeMeters: 100,
    pixelsPerMeter: 10,
    projection: imageProjectionMatrix(
      record,
      calibration,
      pose,
      sceneToPhotoEnu([7.2, 51.27], new Matrix4(), pose, 100)
    ),
  };
};
const sphere: ObjectCoverageSphere = {
  center: { longitude: 7.2, latitude: 51.27, heightMeters: 0 },
  radiusMeters: 5,
};
const groupsOf = (
  north: readonly ObjectCoverageImage[],
  east: readonly ObjectCoverageImage[] = []
): ObjectCoverageGroups =>
  new Map([
    [0, north],
    [1, east],
    [2, []],
    [3, []],
  ]);
const bitmap = () =>
  ({ width: 128, height: 64, close: vi.fn() } as unknown as ImageBitmap);
const draw = vi.fn();
const thumbnailObservers: Array<{
  callback: IntersectionObserverCallback;
  observe: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}> = [];
const captureViewports = () => {
  const makeLease = (source: ImageViewportSource, pool: ImageViewportPool) => {
    let receive: Parameters<ImageViewportHandle["subscribe"]>[0] = () => undefined;
    const unsubscribe = vi.fn();
    return {
      source, pool,
      setViewport: vi.fn(),
      release: vi.fn(),
      unsubscribe,
      subscribe: vi.fn((listener: typeof receive) => {
        receive = listener;
        return unsubscribe;
      }),
      snapshot: vi.fn(),
      publish: (snapshot: Partial<ImageViewportSnapshot>) => receive({
        source, bitmap: null, frame: null, error: null, loading: true, ...snapshot,
      } as ImageViewportSnapshot),
    };
  };
  const leases: ReturnType<typeof makeLease>[] = [];
  vi.spyOn(ImageViewportPool.prototype, "acquire").mockImplementation(function(this: ImageViewportPool, source: ImageViewportSource) {
    const lease = makeLease(source, this);
    leases.push(lease);
    return lease as ImageViewportHandle;
  });
  return leases;
};
const resizeCallbacks: Array<() => void> = [];
let width: number, height: number;
let ground: Mesh, decorative: Mesh;
let release: ReturnType<typeof vi.fn>;
const map = {} as MaplibreMap;
const view = (groups: ObjectCoverageGroups) =>
  render(
    <ObliqueObjectCoverage
      map={map}
      sphere={sphere}
      groups={groups}
      onOpen={vi.fn()}
    />
  );
const photo = (id: string) =>
  document.querySelector(
    `[data-test-id="oblique-coverage-photo"][data-image-id="2024:${id}"]`
  )! as HTMLElement;
const request = (worker: Worker) => worker.postMessage.mock.lastCall![0];
const viewportCrop = (element: HTMLElement) =>
  element.dataset.sourceCrop!.split(",").map(Number);
const setBounds = (element: HTMLElement) => {
  element.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width, height } as DOMRect);
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  Worker.instances = [];
  resizeCallbacks.length = 0;
  width = 400;
  height = 200;
  vi.stubGlobal("Worker", Worker);
  vi.stubGlobal("OffscreenCanvas", class {});
  vi.stubGlobal("devicePixelRatio", 1);
  thumbnailObservers.length = 0;
  vi.stubGlobal("IntersectionObserver", class {
    disconnect = vi.fn();
    constructor(readonly callback: IntersectionObserverCallback) {
      thumbnailObservers.push(this);
    }
    observe = vi.fn();
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        resizeCallbacks.push(callback);
      }
      observe = vi.fn();
      disconnect = vi.fn();
    }
  );
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(
    () => width
  );
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(
    () => height
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: draw,
    clearRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  ground = new Mesh(
    new PlaneGeometry(1000, 1000),
    new MeshBasicMaterial({ side: DoubleSide })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.updateMatrixWorld(true);
  decorative = ground.clone();
  decorative.position.y = 20;
  decorative.updateMatrixWorld(true);
  scene.runtimes.mockReturnValue([
    { root: ground, providesTerrain: true },
    {
      root: decorative,
      providesTerrain: false,
      receivesMapStyleTexture: false,
    },
  ]);
  release = vi.fn();
  scene.acquire.mockReturnValue({
    layer: {
      getLocalFrame: () => ({ sceneFromLocal: new Matrix4(), revision: 1 }),
      projectSceneToLngLat: () => [7.2, 51.27],
    },
    release,
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  ground.geometry.dispose();
  (ground.material as MeshBasicMaterial).dispose();
});

describe("object view crops and navigation", () => {
  it("requests only the AVIF pyramid in strict mode despite a stale original TIFF asset", () => {
    const image = imageOf("strict");
    image.dataset = {
      ...image.dataset,
      avifOnly: true,
      avifPyramidTemplate: "/2026/avif/{imageId}.avif",
    };
    image.record = {
      ...image.record,
      assets: {
        original: { href: "/2026/tiff/strict.tif", type: "image/tiff" },
      },
    };
    view(groupsOf([image]));
    expect(request(Worker.instances[0])).toMatchObject({
      avifOnly: true,
      tiff: false,
      avifPyramidUrl: "http://localhost:3000/2026/avif/strict.avif",
    });
    expect(JSON.stringify(request(Worker.instances[0]))).not.toContain(".tif");
  });
  it("reuses the active crop worker on resize and rejects the previous generation", () => {
    const result = view(groupsOf([imageOf("first")]));
    const worker = Worker.instances[0];
    const initial = request(worker);
    width = 600;
    height = 300;
    act(() => resizeCallbacks.forEach((callback) => callback()));
    const updated = request(worker);
    expect(Worker.instances).toHaveLength(1);
    expect(worker.terminate).not.toHaveBeenCalled();
    expect(updated.generation).toBe(initial.generation + 1);
    expect(updated.window.target.width).toBeGreaterThan(
      initial.window.target.width
    );
    const stale = bitmap();
    worker.reply({ generation: initial.generation, bitmap: stale });
    expect(stale.close).toHaveBeenCalledOnce();
    expect(draw).not.toHaveBeenCalled();
    const current = bitmap();
    worker.reply({ generation: updated.generation, bitmap: current });
    expect(draw).toHaveBeenCalledWith(current, 0, 0);
    result.unmount();
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
  it.each([
    { width: 400, height: 200, dpr: 2 },
    { width: 240, height: 600, dpr: 3 },
  ])(
    "matches a $width x $height container, preserves outside-sensor letterboxing and caps native magnification",
    ({ width: w, height: h, dpr }) => {
      width = w;
      height = h;
      vi.stubGlobal("devicePixelRatio", dpr);
      view(groupsOf([imageOf("edge", { x: 0, y: 0, width: 40, height: 40 })]));
      const element = photo("edge"),
        [x, y, cropWidth, cropHeight] = viewportCrop(element);
      expect(cropWidth / cropHeight).toBeCloseTo(width / height, 10);
      expect(Number(element.dataset.pixelScale)).toBeLessThanOrEqual(3 + 1e-12);
      expect(x).toBeLessThan(0);
      expect(y).toBeLessThan(0);
      const input = request(Worker.instances[0]);
      expect(input.window.source.x).toBe(0);
      expect(input.window.source.y).toBe(0);
      expect(input.window.source.width).toBeLessThan(calibration.widthPx);
      expect(input.window.source.height).toBeLessThan(calibration.heightPx);
      expect(
        input.window.target.width / input.window.source.width
      ).toBeLessThanOrEqual(3);
      expect(
        input.window.target.height / input.window.source.height
      ).toBeLessThanOrEqual(3);
      const canvas = within(element).getByLabelText("edge Objektausschnitt");
      expect(parseFloat(canvas.style.left)).toBeGreaterThan(0);
      expect(parseFloat(canvas.style.top)).toBeGreaterThan(0);
      expect(parseFloat(canvas.style.width)).toBeLessThan(100);
      expect(parseFloat(canvas.style.height)).toBeLessThan(100);
    }
  );

  it("publishes progressive ROI bitmaps without DOM decoding and discards stale completions on unmount", () => {
    const result = view(groupsOf([imageOf("first")]));
    const worker = Worker.instances[0],
      input = request(worker);
    expect(input).toMatchObject({
      flipForTexture: false,
      minimumQualityLevel: "1",
    });
    expect(document.querySelector("img[alt='first']")).toBeNull();
    const first = bitmap();
    worker.reply({ generation: input.generation, bitmap: first });
    expect(draw).toHaveBeenCalledWith(first, 0, 0);
    expect(first.close).toHaveBeenCalledOnce();
    expect(
      within(photo("first")).getByLabelText("first Objektausschnitt").style
        .opacity
    ).toBe("1");
    const captured = worker.onmessage;
    result.unmount();
    expect(worker.postMessage).toHaveBeenLastCalledWith({
      cancel: true,
      park: true,
    });
    expect(worker.terminate).toHaveBeenCalledOnce();
    const stale = bitmap();
    act(() =>
      captured?.({
        data: { generation: input.generation, bitmap: stale },
      } as MessageEvent<Response>)
    );
    expect(stale.close).toHaveBeenCalledOnce();
    expect(draw).toHaveBeenCalledOnce();
  });

  it("preloads only immediate neighbors sequentially at low priority", async () => {
    const leases = captureViewports();
    view(groupsOf(Array.from({ length: 8 }, (_, index) => imageOf(String(index)))));
    expect(leases).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "N Bild 3: 2" }));
    await act(async () => vi.advanceTimersByTimeAsync(175));
    const next = leases.at(-1)!;
    expect(next.source.id).toBe("2024:3");
    expect(next.setViewport).toHaveBeenCalledWith(expect.anything(), undefined, { priority: "low" });
    const window = next.setViewport.mock.calls[0][0];
    act(() => next.publish({
      bitmap: { ...bitmap(), width: window.target.width, height: window.target.height },
      frame: window,
      loading: false,
    }));
    await act(async () => vi.advanceTimersByTimeAsync(175));
    const previous = leases.at(-1)!;
    expect(previous.source.id).toBe("2024:1");
    const previousWindow = previous.setViewport.mock.calls[0][0];
    act(() => previous.publish({
      bitmap: { ...bitmap(), width: previousWindow.target.width, height: previousWindow.target.height },
      frame: previousWindow,
      loading: false,
    }));
    await act(async () => vi.advanceTimersByTimeAsync(20000));
    expect(leases.map(({ source }) => source.id)).toEqual([
      "2024:0", "2024:2", "2024:3", "2024:1",
    ]);
  });

  it("releases an obsolete preload before selecting that photograph and cancels on exit", async () => {
    const leases = captureViewports();
    const result = view(groupsOf([imageOf("first"), imageOf("second"), imageOf("third")]));
    fireEvent.click(screen.getByRole("button", { name: "N: Alternativen vorladen" }));
    await act(async () => vi.advanceTimersByTimeAsync(175));
    const preload = leases.at(-1)!;
    expect(preload.source.id).toBe("2024:second");
    fireEvent.click(screen.getByRole("button", { name: "N Bild 2: second" }));
    expect(preload.unsubscribe).toHaveBeenCalledOnce();
    expect(preload.release).toHaveBeenCalledOnce();
    const active = leases.at(-1)!;
    expect(active.source.id).toBe("2024:second");
    expect(active.setViewport).toHaveBeenCalledWith(expect.anything());
    result.unmount();
    const count = leases.length;
    act(() => preload.publish({ error: "late response" }));
    await act(async () => vi.advanceTimersByTimeAsync(20000));
    expect(leases).toHaveLength(count);
    expect(active.release).toHaveBeenCalledOnce();
  });

  it("bounds mounted photographs and thumbnail subscriptions independently of candidate count", () => {
    captureViewports();
    view(groupsOf(Array.from({ length: 100 }, (_, index) => imageOf(String(index)))));
    expect(document.querySelectorAll('[data-test-id="oblique-coverage-photo"]')).toHaveLength(1);
    expect(document.querySelectorAll('[data-test-id="oblique-coverage-thumbnail"]')).toHaveLength(4);
    expect(thumbnailObservers).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: "N: Nächstes Bild" }));
    expect(photo("1")).toBeTruthy();
    expect(document.querySelectorAll('[data-test-id="oblique-coverage-photo"]')).toHaveLength(1);
  });

  it("requests a visible ROI thumbnail in its separate low-priority pool and redraws repeated bitmap emissions", () => {
    const leases = captureViewports();
    view(groupsOf([imageOf("first"), imageOf("second")]));
    expect(leases).toHaveLength(1);
    const observer = thumbnailObservers[0];
    act(() => observer.callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
    expect(leases).toHaveLength(2);
    const thumbnail = leases[1];
    expect(thumbnail.pool).not.toBe(leases[0].pool);
    const window = thumbnail.setViewport.mock.calls[0][0];
    expect(window.target.width).toBeLessThanOrEqual(112);
    expect(window.target.height).toBeLessThanOrEqual(80);
    expect(window.source.width).toBeLessThan(calibration.widthPx);
    expect(window.source.height).toBeLessThan(calibration.heightPx);
    expect(thumbnail.setViewport).toHaveBeenCalledWith(window, undefined, { priority: "low" });
    const pixels = bitmap();
    act(() => thumbnail.publish({ bitmap: pixels, frame: window }));
    const calls = draw.mock.calls.length;
    act(() => thumbnail.publish({ bitmap: pixels, frame: window }));
    expect(draw).toHaveBeenCalledTimes(calls + 1);
    expect(pixels.close).not.toHaveBeenCalled();
    expect(screen.getByRole("img", { name: "first" })).toBeTruthy();
    act(() => observer.callback([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver));
    expect(thumbnail.release).toHaveBeenCalledOnce();
  });

  it("keeps painted thumbnails visible when the portal host renews observers and leases", () => {
    const leases = captureViewports();
    const groups = groupsOf([imageOf("first"), imageOf("second")]);
    const { container } = render(
      <div data-oblique-object-window="true">
        <ObliqueObjectCoverage map={map} sphere={sphere} groups={groups} onOpen={vi.fn()} />
      </div>
    );
    const observer = thumbnailObservers[0];
    act(() => observer.callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
    const thumbnail = leases[1];
    act(() => thumbnail.publish({ bitmap: bitmap(), frame: thumbnail.setViewport.mock.calls[0][0] }));
    const canvas = screen.getByRole("img", { name: "first" });
    expect(canvas.style.display).toBe("block");

    const observerCount = thumbnailObservers.length;
    act(() => container.querySelector("[data-oblique-object-window]")!.dispatchEvent(new Event("oblique-object-window-change")));
    expect(thumbnail.release).toHaveBeenCalledOnce();
    expect(canvas.style.display).toBe("block");
    const rebound = thumbnailObservers[observerCount];
    act(() => rebound.callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
    // The renewed lease has not delivered pixels; the existing canvas remains visible.
    expect(leases).toHaveLength(3);
    expect(screen.getByRole("img", { name: "first" })).toBe(canvas);
    expect(canvas.style.display).toBe("block");
    expect(canvas.nextElementSibling).toBeNull();
  });

  it("uses ROI thumbnails to change the active source and opens only on double click or keyboard", () => {
    const onOpen = vi.fn();
    render(
      <ObliqueObjectCoverage
        map={map}
        sphere={sphere}
        groups={groupsOf([imageOf("first"), imageOf("second")])}
        onOpen={onOpen}
      />
    );
    const first = screen.getByRole("button", { name: "N Bild 1: first" }),
      second = screen.getByRole("button", { name: "N Bild 2: second" });
    expect(first.querySelector('canvas[aria-label="first"]')).not.toBeNull();
    expect(first.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(second);
    expect(second.getAttribute("aria-pressed")).toBe("true");
    expect(first.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(photo("second"));
    expect(onOpen).not.toHaveBeenCalled();
    fireEvent.doubleClick(photo("second"));
    expect(onOpen).toHaveBeenLastCalledWith("2024:second");
    fireEvent.keyDown(photo("second"), { key: "Enter" });
    expect(onOpen).toHaveBeenCalledTimes(2);
  });
});

describe("shared physical measurements in object photographs", () => {
  it.each(["mesh", "terrain", "auto"] as const)("uses the shared %s surface picker once per photo click and clones its physical hit for every photograph", (surfaceMode) => {
    const sharedPoint = new Vector3(0, 0, 0);
    const surfacePicker = {
      intersectSurface: vi.fn(() => ({
        point: sharedPoint,
        surface: "terrain" as const,
      })),
    };
    const nativeIntersect = vi.spyOn(Raycaster.prototype, "intersectObjects");
    render(
      <ObliqueObjectCoverage
        map={map}
        sphere={sphere}
        groups={groupsOf([imageOf("north")], [imageOf("east")])}
        surfacePicker={surfacePicker}
        surfaceMode={surfaceMode}
        onOpen={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Strecke messen" }));
    const north = photo("north");
    setBounds(north);
    fireEvent.click(north, { clientX: width / 2, clientY: height / 2 });
    expect(surfacePicker.intersectSurface).toHaveBeenCalledOnce();
    const [ray, location, selectedSurface] = surfacePicker.intersectSurface.mock
      .lastCall! as unknown as [Raycaster, [number, number], string];
    expect(selectedSurface).toBe(surfaceMode);
    expect(ray).toBeInstanceOf(Raycaster);
    expect(location).toEqual([pose.longitude, pose.latitude]);
    expect(ray.ray.origin.y).toBeCloseTo(100, 7);
    expect(ray.ray.direction.y).toBeCloseTo(-1, 7);
    const first = document.querySelector(
      '[data-test-id="oblique-coverage-measurement"] circle'
    )!;
    const x = first.getAttribute("cx"),
      y = first.getAttribute("cy");
    sharedPoint.set(3, 0, 0);
    expect(first.getAttribute("cx")).toBe(x);
    expect(first.getAttribute("cy")).toBe(y);
    fireEvent.click(north, { clientX: width / 2, clientY: height / 2 });
    expect(surfacePicker.intersectSurface).toHaveBeenCalledTimes(2);
    expect(sharedPoint.toArray()).toEqual([3, 0, 0]);
    expect(screen.getAllByText("3 m")).toHaveLength(3);
    for (const markers of document.querySelectorAll(
      '[data-test-id="oblique-coverage-measurement"]'
    )) {
      expect(markers.querySelectorAll("circle")).toHaveLength(2);
      expect(markers.querySelector("circle")!.getAttribute("cx")).toBe(x);
      expect(markers.querySelector("circle")!.getAttribute("cy")).toBe(y);
    }
    expect(nativeIntersect).not.toHaveBeenCalled();
    expect(scene.runtimes).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledTimes(2);
  });

  it("honors a shared picker miss without a conflicting direct-mesh fallback", () => {
    const surfacePicker = { intersectSurface: vi.fn(() => null) };
    const nativeIntersect = vi.spyOn(Raycaster.prototype, "intersectObjects");
    render(
      <ObliqueObjectCoverage
        map={map}
        sphere={sphere}
        groups={groupsOf([imageOf("north")])}
        surfacePicker={surfacePicker}
        onOpen={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Strecke messen" }));
    setBounds(photo("north"));
    fireEvent.click(photo("north"), {
      clientX: width / 2,
      clientY: height / 2,
    });
    expect(surfacePicker.intersectSurface).toHaveBeenCalledOnce();
    expect(nativeIntersect).not.toHaveBeenCalled();
    expect(scene.runtimes).not.toHaveBeenCalled();
    expect(
      document.querySelector('[data-test-id="oblique-coverage-measurement"]')
    ).toBeNull();
    expect(
      screen.getByText(
        "An dieser Bildstelle ist noch keine Oberfläche geladen."
      )
    ).toBeTruthy();
    expect(release).toHaveBeenCalledOnce();
  });

  it.each([
    ["mesh", "published-tiles"],
    ["terrain", "published-tiles"],
    ["auto", "published-tiles"],
    ["mesh", "surface-marker"],
    ["terrain", "surface-marker"],
    ["auto", "surface-marker"],
  ] as const)("filters fallback %s receivers using DEM %s identification", (surfaceMode, identification) => {
    const nativeIntersect = vi.spyOn(Raycaster.prototype, "intersectObjects");
    if (identification === "surface-marker")
      decorative.userData.isShadowTerrainSurface = true;
    scene.runtimes.mockReturnValue([
      // Detailed mesh runtimes provide elevation too; that does not make them DEMs.
      { root: ground, providesTerrain: true },
      {
        root: decorative,
        providesTerrain: true,
        ...(identification === "published-tiles"
          ? { getPublishedTerrainTiles: () => [] }
          : {}),
      },
    ]);
    render(
      <ObliqueObjectCoverage
        map={map}
        sphere={sphere}
        groups={groupsOf([imageOf("north")])}
        surfaceMode={surfaceMode}
        onOpen={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Strecke messen" }));
    setBounds(photo("north"));
    fireEvent.click(photo("north"), {
      clientX: width / 2,
      clientY: height / 2,
    });
    expect(nativeIntersect).toHaveBeenCalledWith(
      surfaceMode === "mesh" ? [ground]
        : surfaceMode === "terrain" ? [decorative] : [ground, decorative],
      false
    );
  });

  it("casts calibrated photo-camera rays on actual receivers and projects the same metre points into every active image", () => {
    const intersections = vi.spyOn(Raycaster.prototype, "intersectObjects");
    view(groupsOf([imageOf("north")], [imageOf("east")]));
    fireEvent.click(screen.getByRole("button", { name: "Strecke messen" }));
    const north = photo("north");
    setBounds(north);
    const [x, y, cropWidth, cropHeight] = viewportCrop(north);
    const at = (pixelX: number, pixelY: number) =>
      fireEvent.click(north, {
        clientX: ((pixelX - x) * width) / cropWidth,
        clientY: ((pixelY - y) * height) / cropHeight,
      });
    at(1000, 500);
    fireEvent.click(north, { clientX: width / 2 + 20, clientY: height / 2 });
    expect(intersections).toHaveBeenCalledTimes(2);
    expect(intersections.mock.calls[0][0]).toEqual([ground]);
    expect(release).toHaveBeenCalledTimes(2);
    // The L1 delivery cap expands this viewport to 266⅔ L0 pixels: 20 CSS px = 1⅓ m.
    expect(screen.getAllByText("1,33 m")).toHaveLength(3);
    const markers = document.querySelectorAll(
      '[data-test-id="oblique-coverage-measurement"]'
    );
    expect(markers).toHaveLength(2);
    for (const marker of markers) {
      expect(marker.querySelectorAll("circle")).toHaveLength(2);
      expect(marker.querySelectorAll("line")).toHaveLength(2);
    }
    expect(markers[0].querySelector("circle")!.getAttribute("cx")).toBe(
      markers[1].querySelector("circle")!.getAttribute("cx")
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Letzten Punkt entfernen" })
    );
    for (const marker of document.querySelectorAll(
      '[data-test-id="oblique-coverage-measurement"]'
    ))
      expect(marker.querySelectorAll("circle")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Messung löschen" }));
    expect(
      document.querySelector('[data-test-id="oblique-coverage-measurement"]')
    ).toBeNull();
  });

  it("does not fabricate a measurement when no loaded surface intersects the photo ray", () => {
    scene.runtimes.mockReturnValue([]);
    view(groupsOf([imageOf("north")]));
    fireEvent.click(screen.getByRole("button", { name: "Strecke messen" }));
    setBounds(photo("north"));
    fireEvent.click(photo("north"), {
      clientX: width / 2,
      clientY: height / 2,
    });
    expect(
      screen.getByText(
        "An dieser Bildstelle ist noch keine Oberfläche geladen."
      )
    ).toBeTruthy();
    expect(
      document.querySelector('[data-test-id="oblique-coverage-measurement"]')
    ).toBeNull();
    expect(release).toHaveBeenCalledOnce();
  });
});
