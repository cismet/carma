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
} from "./utils/image-projection";
import { ObliqueObjectCoverage } from "./ObliqueObjectCoverage";

const scene = vi.hoisted(() => ({
  acquire: vi.fn(),
  runtimes: vi.fn(),
  release: vi.fn(),
}));
const thumbnails = vi.hoisted(() => ({ receive: vi.fn() }));
vi.mock("@carma-mapping/engines/maplibre", () => ({
  acquireSharedThreeScene: scene.acquire,
  getSharedThreeSceneRuntimes: scene.runtimes,
}));
vi.mock("./hooks/useProgressivePreviewSource", () => ({
  useProgressivePreviewSource: () => null,
}));
vi.mock("./hooks/usePrefetchedPreviewThumbnail", () => ({
  usePrefetchedPreviewThumbnail: thumbnails.receive,
}));
vi.mock("antd", async () => {
  const React = await import("react");
  return {
    Button: ({ children, size: _size, type: _type, ...props }: any) => (
      <button {...props}>{children}</button>
    ),
    Tooltip: ({ children }: any) => children,
    Carousel: React.forwardRef(({ children, beforeChange }: any, ref) => {
      const active = React.useRef(0);
      React.useImperativeHandle(ref, () => ({
        goTo: (next: number) => {
          beforeChange?.(active.current, next);
          active.current = next;
        },
      }));
      return <div data-test-id="mock-carousel">{children}</div>;
    }),
  };
});

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
  vi.stubGlobal("IntersectionObserver", undefined);
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
  thumbnails.receive.mockImplementation((_path, id) => ({
    blobUrl: "blob:thumb:" + id,
  }));
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

  it("preloads direction alternatives sequentially, advances only on current completion and cancels on exit", async () => {
    const result = view(
      groupsOf([imageOf("first"), imageOf("second"), imageOf("third")])
    );
    expect(Worker.instances).toHaveLength(1);
    fireEvent.click(
      screen.getByRole("button", { name: "N: Alternativen vorladen" })
    );
    expect(Worker.instances).toHaveLength(2);
    const preload = Worker.instances[1];
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(preload.postMessage).toHaveBeenCalledOnce();
    expect(request(preload)).toMatchObject({
      priority: "low",
      maxInitialDisplayPixelSize: 1,
      refineToNative: false,
      generation: 1,
    });
    expect(request(preload).url).toMatch(/\/1\/second\.jpg$/);
    const partial = bitmap();
    preload.reply({ generation: 1, bitmap: partial, complete: false });
    const stale = bitmap();
    preload.reply({ generation: 0, bitmap: stale, complete: true });
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(preload.postMessage).toHaveBeenCalledOnce();
    expect(partial.close).toHaveBeenCalledOnce();
    expect(stale.close).toHaveBeenCalledOnce();
    const complete = bitmap();
    preload.reply({ generation: 1, bitmap: complete, complete: true });
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(preload.postMessage).toHaveBeenCalledTimes(2);
    expect(request(preload).url).toMatch(/\/1\/third\.jpg$/);
    expect(request(preload).generation).toBe(2);
    result.unmount();
    expect(preload.postMessage).toHaveBeenLastCalledWith({
      cancel: true,
      park: true,
    });
    expect(preload.terminate).toHaveBeenCalledOnce();
    await act(async () => vi.advanceTimersByTimeAsync(20000));
    expect(preload.postMessage).toHaveBeenCalledTimes(3);
  });

  it("keeps one alternative preload queue across carousel switches and leaves its idle worker alive for cache writes", async () => {
    const view = render(
      <ObliqueObjectCoverage
        map={map}
        sphere={sphere}
        groups={groupsOf([
          imageOf("first"),
          imageOf("second"),
          imageOf("third"),
        ])}
        onOpen={vi.fn()}
      />
    );
    fireEvent.click(
      screen.getByRole("button", { name: "N: Alternativen vorladen" })
    );
    const preload = Worker.instances[1];
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(request(preload).url).toMatch(/\/second\.jpg$/);
    fireEvent.click(screen.getByRole("button", { name: "N Bild 3: third" }));
    expect(preload.terminate).not.toHaveBeenCalled();
    expect(preload.postMessage).toHaveBeenCalledOnce();
    expect(Worker.instances).toHaveLength(3); // initial active, stable preloader, new active
    preload.reply({ generation: 1, bitmap: bitmap(), complete: true });
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(request(preload).url).toMatch(/\/third\.jpg$/);
    expect(request(preload).generation).toBe(2);
    preload.reply({ generation: 2, bitmap: bitmap(), complete: true });
    await act(async () => vi.advanceTimersByTimeAsync(20000));
    expect(preload.postMessage).toHaveBeenCalledTimes(2);
    expect(preload.terminate).not.toHaveBeenCalled();
    view.unmount();
    expect(preload.postMessage).toHaveBeenLastCalledWith({
      cancel: true,
      park: true,
    });
    expect(preload.terminate).toHaveBeenCalledOnce();
  });

  it("uses carousel thumbnails to change the active source and opens only on double click or keyboard", () => {
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
    expect(
      within(first).getByRole("img", { name: "first" }).getAttribute("src")
    ).toBe("blob:thumb:first");
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
  it("uses the shared surface picker once per photo click and clones its physical hit for every photograph", () => {
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
        onOpen={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Strecke messen" }));
    const north = photo("north");
    setBounds(north);
    fireEvent.click(north, { clientX: width / 2, clientY: height / 2 });
    expect(surfacePicker.intersectSurface).toHaveBeenCalledOnce();
    const [ray, location] = surfacePicker.intersectSurface.mock
      .lastCall! as unknown as [Raycaster, [number, number]];
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
    expect(screen.getAllByText("1,02 m")).toHaveLength(3);
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
