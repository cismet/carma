import { StrictMode } from "react";
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
import type { Meters } from "@carma-units";
import { sceneToPresentationPoint } from "../core/utils/photo-center-rays";
import { objectCoverageViewPoint } from "../core/utils/object-coverage-navigation";
import { projectObjectCoveragePoint } from "../core/utils/object-coverage";
import { projectObjectCoverageOutline } from "../core/utils/object-coverage-outline";
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
import {
  ImageViewportPool,
  type ImageViewportHandle,
  type ImageViewportSnapshot,
  type ImageViewportSource,
} from "@carma-commons/image-pyramid";

vi.hoisted(() => {
  // MapLibre registers its worker URL when the presentation-coordinate module is loaded.
  URL.createObjectURL ??= () => "blob:object-coverage-fixture";
  URL.revokeObjectURL ??= () => {};
});

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
    <button {...props}>
      {icon}
      {children}
    </button>
  ),
  Tooltip: ({ children }: any) => children,
}));

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
  utmConvergenceRad: 0,
};
const dataset = {
  id: "2024",
  label: "04/2024",
  shortLabel: "2024",
  previewPath: "/images",
  avifPyramidTemplate: "/images/{imageId}.avif",
  cameras: { test: calibration },
  minimumPreviewQualityLevel: "1",
  heightDatum: "ellipsoidal",
} as unknown as ObliqueDataset;
type FixtureImage = {
  -readonly [Key in keyof ObjectCoverageImage]: ObjectCoverageImage[Key];
};
const imageOf = (
  id: string,
  crop: ObjectCoverageImage["crop"] = {
    x: 949,
    y: 449,
    width: 102,
    height: 102,
  }
): FixtureImage => {
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
    fallbackHeading: 0,
    sector: 0,
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
// Physical capture/ground centers differ; duplicate coordinates would have no neighbors.
const offsetImage = (id: string, dx: number, dy = 0): FixtureImage => {
  const image = imageOf(id);
  const center = objectCoverageViewPoint(
    image,
    sphere,
    { x: 1000 + dx, y: 500 + dy },
    0
  )!;
  const origin: [number, number] = [
    sphere.center.longitude,
    sphere.center.latitude,
  ];
  const groundPoint = sceneToPresentationPoint(center, origin, new Matrix4());
  const eye = sceneToPresentationPoint(
    center.clone().setY(100),
    origin,
    new Matrix4()
  );
  const shiftedPose = {
    ...pose,
    longitude: eye.longitude,
    latitude: eye.latitude,
    z: eye.heightMeters,
  };
  image.record = {
    ...image.record,
    pose: shiftedPose,
    centerWGS84: [eye.longitude, eye.latitude, eye.heightMeters],
    catalogCenter: {
      ...groundPoint,
      heightMeters: groundPoint.heightMeters as Meters,
      ecefMeters: [0, 0, 0],
    },
  };
  image.projection = imageProjectionMatrix(
    image.record,
    calibration,
    shiftedPose,
    sceneToPhotoEnu(origin, new Matrix4(), shiftedPose, eye.heightMeters)
  );
  const sensor = projectObjectCoveragePoint(
    image.projection,
    new Vector3(0, 0, 0),
    calibration
  )!;
  image.crop = { x: sensor.x - 51, y: sensor.y - 51, width: 102, height: 102 };
  return image;
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
    let receive: Parameters<ImageViewportHandle["subscribe"]>[0] = () =>
      undefined;
    const unsubscribe = vi.fn(() => {
      receive = () => undefined;
    });
    return {
      source,
      pool,
      setViewport: vi.fn(),
      release: vi.fn(),
      unsubscribe,
      subscribe: vi.fn((listener: typeof receive) => {
        receive = listener;
        return unsubscribe;
      }),
      snapshot: vi.fn(),
      publish: (snapshot: Partial<ImageViewportSnapshot>) =>
        receive({
          source,
          bitmap: null,
          frame: null,
          error: null,
          loading: true,
          ...snapshot,
        } as ImageViewportSnapshot),
    };
  };
  const leases: ReturnType<typeof makeLease>[] = [];
  vi.spyOn(ImageViewportPool.prototype, "acquire").mockImplementation(function (
    this: ImageViewportPool,
    source: ImageViewportSource
  ) {
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
const viewportCrop = (element: HTMLElement) =>
  element.dataset.sourceCrop!.split(",").map(Number);
const setBounds = (element: HTMLElement) => {
  element.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width, height } as DOMRect);
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  resizeCallbacks.length = 0;
  width = 400;
  height = 200;
  vi.stubGlobal(
    "PointerEvent",
    class extends MouseEvent {
      readonly pointerId: number;
      readonly isPrimary: boolean;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 1;
        this.isPrimary = init.isPrimary ?? true;
      }
    }
  );
  vi.stubGlobal("Worker", vi.fn());
  vi.stubGlobal("OffscreenCanvas", class {});
  vi.stubGlobal("devicePixelRatio", 1);
  thumbnailObservers.length = 0;
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      disconnect = vi.fn();
      constructor(readonly callback: IntersectionObserverCallback) {
        thumbnailObservers.push(this);
      }
      observe = vi.fn();
    }
  );
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
  } as never);
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
    const leases = captureViewports();
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
    expect(leases).toHaveLength(1);
    expect(leases[0].source).toMatchObject({
      kind: "avif",
      url: "http://localhost:3000/2026/avif/strict.avif",
      avifPyramidUrl: "http://localhost:3000/2026/avif/strict.avif",
    });
    expect(JSON.stringify(leases[0].source)).not.toContain(".tif");
  });
  it("retains the same pooled handle on resize and releases only on unmount", () => {
    const leases = captureViewports();
    const result = view(groupsOf([imageOf("first")]));
    const handle = leases[0];
    const initialWindow = handle.setViewport.mock.lastCall![0];
    width = 600;
    height = 300;
    act(() => resizeCallbacks.forEach((callback) => callback()));
    expect(leases).toHaveLength(1);
    const updatedWindow = handle.setViewport.mock.lastCall![0];
    expect(updatedWindow.target.width).toBeGreaterThan(
      initialWindow.target.width
    );
    expect(handle.unsubscribe).not.toHaveBeenCalled();
    expect(handle.release).not.toHaveBeenCalled();
    const previousBitmap = bitmap();
    act(() => handle.publish({ bitmap: previousBitmap, frame: initialWindow }));
    expect(draw).toHaveBeenCalledWith(previousBitmap, 0, 0);
    const current = bitmap();
    act(() => handle.publish({ bitmap: current, frame: updatedWindow }));
    expect(draw).toHaveBeenCalledWith(current, 0, 0);
    result.unmount();
    expect(handle.unsubscribe).toHaveBeenCalledOnce();
    expect(handle.release).toHaveBeenCalledOnce();
    draw.mockClear();
    act(() => handle.publish({ bitmap: bitmap(), frame: updatedWindow }));
    expect(draw).not.toHaveBeenCalled();
  });
  it.each([
    { width: 400, height: 200, dpr: 2 },
    { width: 240, height: 600, dpr: 3 },
  ])(
    "matches a $width x $height container, preserves outside-sensor letterboxing and caps native magnification",
    ({ width: w, height: h, dpr }) => {
      const leases = captureViewports();
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
      const input = { window: leases[0].setViewport.mock.lastCall![0] };
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
      act(() => leases[0].publish({ bitmap: bitmap(), frame: input.window }));
      const canvas = within(element).getByLabelText("edge Objektausschnitt");
      expect(parseFloat(canvas.style.left)).toBeGreaterThan(0);
      expect(parseFloat(canvas.style.top)).toBeGreaterThan(0);
      expect(parseFloat(canvas.style.width)).toBeLessThan(100);
      expect(parseFloat(canvas.style.height)).toBeLessThan(100);
    }
  );

  it("publishes pooled ROI bitmaps without DOM decoding and unsubscribes on unmount", () => {
    const leases = captureViewports();
    const result = view(groupsOf([imageOf("first")]));
    const handle = leases[0];
    const frame = handle.setViewport.mock.lastCall![0];
    expect(handle.source.maxSourceDensity).toBe(0.5);
    expect(document.querySelector("img[alt='first']")).toBeNull();
    const first = bitmap();
    act(() => handle.publish({ bitmap: first, frame }));
    expect(draw).toHaveBeenCalledWith(first, 0, 0);
    // The pool owns the bitmap lifetime, including warm reuse by another lease.
    expect(first.close).not.toHaveBeenCalled();
    expect(
      within(photo("first")).getByLabelText("first Objektausschnitt").style
        .opacity
    ).toBe("1");
    result.unmount();
    expect(handle.unsubscribe).toHaveBeenCalledOnce();
    expect(handle.release).toHaveBeenCalledOnce();
    act(() => handle.publish({ bitmap: bitmap(), frame }));
    expect(draw).toHaveBeenCalledOnce();
    expect(first.close).not.toHaveBeenCalled();
  });

  it("preloads only the four physical neighbors sequentially at low priority", async () => {
    const leases = captureViewports();
    const foreign = offsetImage("foreign", 5);
    foreign.record = { ...foreign.record, seriesId: "2026" };
    view(
      groupsOf([
        offsetImage("active", 0),
        offsetImage("right", 30),
        offsetImage("left", -30),
        offsetImage("up", 0, -30),
        offsetImage("down", 0, 30),
        offsetImage("far", 80),
        foreign,
      ])
    );
    expect(leases).toHaveLength(1);
    fireEvent.mouseEnter(
      screen.getByRole("button", { name: "N: Bild rechts" })
    );
    for (const id of ["right", "left", "up", "down"]) {
      await act(async () => vi.advanceTimersByTimeAsync(175));
      const next = leases.at(-1)!;
      expect(next.source.id).toBe("2024:" + id);
      expect(next.setViewport).toHaveBeenCalledWith(
        expect.anything(),
        undefined,
        { priority: "low" }
      );
      const window = next.setViewport.mock.calls[0][0];
      act(() =>
        next.publish({
          bitmap: {
            ...bitmap(),
            width: window.target.width,
            height: window.target.height,
          },
          frame: window,
          loading: false,
        })
      );
    }
    await act(async () => vi.advanceTimersByTimeAsync(20000));
    expect(leases.map(({ source }) => source.id)).toEqual([
      "2024:active",
      "2024:right",
      "2024:left",
      "2024:up",
      "2024:down",
    ]);
  });

  it("releases an obsolete preload before selecting that photograph and cancels on exit", async () => {
    const leases = captureViewports();
    const result = view(
      groupsOf([
        offsetImage("first", 0),
        offsetImage("second", 30),
        offsetImage("third", 60),
      ])
    );
    fireEvent.mouseEnter(
      screen.getByRole("button", { name: "N: Bild rechts" })
    );
    await act(async () => vi.advanceTimersByTimeAsync(175));
    const preload = leases.at(-1)!;
    expect(preload.source.id).toBe("2024:second");
    fireEvent.click(screen.getByRole("button", { name: "N: Bild rechts" }));
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
    view(
      groupsOf([
        offsetImage("0", 0),
        ...Array.from({ length: 99 }, (_, index) => {
          const distance = 30 * (1 + Math.floor(index / 4));
          const [dx, dy] = [
            [distance, 0],
            [-distance, 0],
            [0, -distance],
            [0, distance],
          ][index % 4];
          return offsetImage(String(index + 1), dx, dy);
        }),
      ])
    );
    expect(
      document.querySelectorAll('[data-test-id="oblique-coverage-photo"]')
    ).toHaveLength(1);
    expect(
      document.querySelectorAll('[data-test-id="oblique-coverage-thumbnail"]')
    ).toHaveLength(4);
    expect(thumbnailObservers).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: "N: Bild rechts" }));
    expect(photo("1")).toBeTruthy();
    expect(
      document.querySelectorAll('[data-test-id="oblique-coverage-photo"]')
    ).toHaveLength(1);
  });

  it("requests a visible ROI thumbnail in its separate low-priority pool and redraws repeated bitmap emissions", () => {
    const leases = captureViewports();
    view(groupsOf([offsetImage("first", 0), offsetImage("second", 30)]));
    expect(leases).toHaveLength(1);
    const observer = thumbnailObservers[0];
    act(() =>
      observer.callback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver
      )
    );
    expect(leases).toHaveLength(2);
    const thumbnail = leases[1];
    expect(thumbnail.pool).not.toBe(leases[0].pool);
    const window = thumbnail.setViewport.mock.calls[0][0];
    expect(window.target.width).toBeLessThanOrEqual(112);
    expect(window.target.height).toBeLessThanOrEqual(80);
    expect(window.source.width).toBeLessThan(calibration.widthPx);
    expect(window.source.height).toBeLessThan(calibration.heightPx);
    expect(thumbnail.setViewport).toHaveBeenCalledWith(window, undefined, {
      priority: "low",
    });
    const pixels = bitmap();
    act(() => thumbnail.publish({ bitmap: pixels, frame: window }));
    const calls = draw.mock.calls.length;
    act(() => thumbnail.publish({ bitmap: pixels, frame: window }));
    expect(draw).toHaveBeenCalledTimes(calls + 1);
    expect(pixels.close).not.toHaveBeenCalled();
    expect(screen.getByRole("img", { name: "second" })).toBeTruthy();
    act(() =>
      observer.callback(
        [{ isIntersecting: false } as IntersectionObserverEntry],
        {} as IntersectionObserver
      )
    );
    expect(thumbnail.release).toHaveBeenCalledOnce();
  });

  it("keeps painted thumbnails visible when the portal host renews observers and leases", () => {
    const leases = captureViewports();
    const groups = groupsOf([
      offsetImage("first", 0),
      offsetImage("second", 30),
    ]);
    const { container } = render(
      <div data-oblique-object-window="true">
        <ObliqueObjectCoverage
          map={map}
          sphere={sphere}
          groups={groups}
          onOpen={vi.fn()}
        />
      </div>
    );
    const observer = thumbnailObservers[0];
    act(() =>
      observer.callback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver
      )
    );
    const thumbnail = leases[1];
    act(() =>
      thumbnail.publish({
        bitmap: bitmap(),
        frame: thumbnail.setViewport.mock.calls[0][0],
      })
    );
    const canvas = screen.getByRole("img", { name: "second" });
    expect(canvas.style.display).toBe("block");

    const observerCount = thumbnailObservers.length;
    act(() =>
      container
        .querySelector("[data-oblique-object-window]")!
        .dispatchEvent(new Event("oblique-object-window-change"))
    );
    expect(thumbnail.release).toHaveBeenCalledOnce();
    expect(canvas.style.display).toBe("block");
    const rebound = thumbnailObservers[observerCount];
    act(() =>
      rebound.callback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver
      )
    );
    // The renewed lease has not delivered pixels; the existing canvas remains visible.
    expect(leases).toHaveLength(3);
    expect(screen.getByRole("img", { name: "second" })).toBe(canvas);
    expect(canvas.style.display).toBe("block");
    expect(canvas.nextElementSibling).toBeNull();
  });

  it("uses ROI thumbnails to change the active source and opens only on double click or keyboard", () => {
    const onOpen = vi.fn();
    render(
      <ObliqueObjectCoverage
        map={map}
        sphere={sphere}
        groups={groupsOf([offsetImage("first", 0), offsetImage("second", 30)])}
        onOpen={onOpen}
      />
    );
    const next = screen.getByRole("button", { name: "N: Bild rechts" });
    expect(next.querySelector('canvas[aria-label="second"]')).not.toBeNull();
    fireEvent.click(next);
    expect(photo("second")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "N: Bild links" })
        .getAttribute("data-neighbor-image-id")
    ).toBe("2024:first");
    fireEvent.click(photo("second"));
    expect(onOpen).not.toHaveBeenCalled();
    fireEvent.doubleClick(photo("second"));
    expect(onOpen).toHaveBeenLastCalledWith("2024:second");
    fireEvent.keyDown(photo("second"), { key: "Enter" });
    expect(onOpen).toHaveBeenCalledTimes(2);
  });
  it("places the compass beside the cardinal with the actual sixteen-wind heading and has no carousel", () => {
    const active = offsetImage("active", 0);
    active.record = {
      ...active.record,
      pose: { ...active.record.pose!, bearingDeg: 22.5 },
    };
    const { container } = view(groupsOf([active, offsetImage("right", 30)]));
    const quadrant = screen.getByRole("region", {
      name: "Objektansichtenabfrage N",
    });
    const header = quadrant.querySelector(".oblique-object-image-label")!;
    expect(
      header.querySelector(".oblique-object-cardinal-label")?.textContent
    ).toBe("N");
    const compass = within(quadrant).getByRole("img", {
      name: "Nordrichtung im Bild",
    });
    expect(compass.parentElement).toBe(header);
    expect(header.querySelector(".oblique-object-heading")?.textContent).toBe(
      "NNO +23°"
    );
    expect(container.querySelector(".oblique-object-carousel")).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Vorheriges Bild|Nächstes Bild/ })
    ).toBeNull();
  });

  it("offers only the nearest same-series neighbor and hides absent directions", () => {
    const foreign = offsetImage("foreign", 5);
    foreign.record = { ...foreign.record, seriesId: "2026" };
    const far = offsetImage("far", 90),
      near = offsetImage("near", 30);
    view(groupsOf([offsetImage("active", 0), far, foreign, near]));
    const right = screen.getByRole("button", { name: "N: Bild rechts" });
    expect(right.getAttribute("data-neighbor-image-id")).toBe("2024:near");
    expect(
      right
        .querySelector(".oblique-object-neighbor-arrow svg")
        ?.getAttribute("data-icon")
    ).toBe("chevron-right");
    for (const direction of ["links", "oben", "unten"])
      expect(
        screen.queryByRole("button", { name: "N: Bild " + direction })
      ).toBeNull();
    expect(
      document.querySelectorAll('[data-test-id="oblique-coverage-thumbnail"]')
    ).toHaveLength(1);
    fireEvent.click(right);
    expect(photo("near")).toBeTruthy();
    expect(photo("foreign")).toBeNull();
  });

  it("preserves the panned world focus and zoom when selecting a spatial neighbor", () => {
    const leases = captureViewports(),
      first = offsetImage("first", 0),
      second = offsetImage("second", 30);
    view(groupsOf([first, second]));
    const element = prepareNavigationPhoto(photo("first"));
    dragPhoto(element, 12, -8);
    fireEvent.wheel(element, {
      deltaY: -160,
      clientX: width / 2,
      clientY: height / 2,
    });
    act(() => vi.advanceTimersByTime(20));
    const before = viewportCrop(element);
    const point = objectCoverageViewPoint(
      first,
      sphere,
      { x: before[0] + before[2] / 2, y: before[1] + before[3] / 2 },
      0
    )!;
    expect(point.length()).toBeGreaterThan(0.1);
    fireEvent.click(screen.getByRole("button", { name: "N: Bild rechts" }));
    const after = viewportCrop(photo("second"));
    const nextPoint = objectCoverageViewPoint(
      second,
      sphere,
      { x: after[0] + after[2] / 2, y: after[1] + after[3] / 2 },
      0
    )!;
    expect(nextPoint.distanceTo(point)).toBeLessThan(1e-5);
    expect(after[2]).toBeCloseTo(before[2], 5);
    expect(after[3]).toBeCloseTo(before[3], 5);
    expect(leases[0].release).toHaveBeenCalledOnce();
    expect(leases.at(-1)!.source.id).toBe("2024:second");
    expect(scene.acquire).not.toHaveBeenCalled();
  });
});

const prepareNavigationPhoto = (element: HTMLElement) => {
  setBounds(element);
  const captured = new Set<number>();
  element.setPointerCapture = vi.fn((id) => {
    captured.add(id);
  });
  element.hasPointerCapture = vi.fn((id) => captured.has(id));
  element.releasePointerCapture = vi.fn((id) => {
    captured.delete(id);
  });
  return element;
};
const dragPhoto = (element: HTMLElement, dx = 12, dy = 0, finish = true) => {
  fireEvent.pointerDown(element, {
    pointerId: 7,
    button: 0,
    clientX: width / 2,
    clientY: height / 2,
  });
  fireEvent.pointerMove(element, {
    pointerId: 7,
    buttons: 1,
    clientX: width / 2 + dx,
    clientY: height / 2 + dy,
  });
  act(() => vi.advanceTimersByTime(20));
  if (finish)
    fireEvent.pointerUp(element, {
      pointerId: 7,
      button: 0,
      clientX: width / 2 + dx,
      clientY: height / 2 + dy,
    });
};
const fourViews = (host = false) => {
  const names = ["north", "east", "south", "west"];
  const images = names.map((id, index) => {
    const image = imageOf(id);
    const angle = (index * Math.PI) / 2;
    const cameraPose = {
      ...pose,
      up: [Math.sin(angle), Math.cos(angle), 0] as [number, number, number],
    };
    image.record = { ...image.record, pose: cameraPose };
    image.projection = imageProjectionMatrix(
      image.record,
      calibration,
      cameraPose,
      sceneToPhotoEnu(
        [sphere.center.longitude, sphere.center.latitude],
        new Matrix4(),
        cameraPose,
        100
      )
    );
    return image;
  });
  const groups: ObjectCoverageGroups = new Map(
    images.map((image, index) => [index as 0 | 1 | 2 | 3, [image]])
  );
  const result = host
    ? render(
        <div data-oblique-object-window="true">
          <ObliqueObjectCoverage
            map={map}
            sphere={sphere}
            groups={groups}
            onOpen={vi.fn()}
          />
        </div>
      )
    : view(groups);
  const elements = names.map((id) => prepareNavigationPhoto(photo(id)));
  return { ...result, groups, elements };
};

describe("coupled object photo navigation", () => {
  it("opens the first usable viewport after a one-pixel layout and retains non-passive wheel input through StrictMode replay", () => {
    const leases = captureViewports();
    width = height = 1;
    const groups = groupsOf([imageOf("north")]);
    const result = render(
      <StrictMode>
        <ObliqueObjectCoverage
          map={map}
          sphere={sphere}
          groups={groups}
          onOpen={vi.fn()}
        />
      </StrictMode>
    );
    expect(leases).toHaveLength(0);
    width = 400;
    height = 200;
    act(() => resizeCallbacks.forEach((callback) => callback()));
    expect(leases).toHaveLength(1);
    const element = prepareNavigationPhoto(photo("north")),
      before = viewportCrop(element);
    const wheel = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY: -100,
      clientX: width / 2,
      clientY: height / 2,
    });
    act(() => element.dispatchEvent(wheel));
    expect(wheel.defaultPrevented).toBe(true);
    expect(viewportCrop(element)[2]).toBeLessThan(before[2]);
    expect(leases).toHaveLength(1);
    result.unmount();
    expect(leases[0].release).toHaveBeenCalledOnce();
  });
  it("cancels pending captured input when a replacement sphere remounts the quadrants", () => {
    const leases = captureViewports(),
      groups = groupsOf([imageOf("north")]),
      onOpen = vi.fn();
    const result = render(
      <ObliqueObjectCoverage
        map={map}
        sphere={sphere}
        groups={groups}
        onOpen={onOpen}
      />
    );
    const element = prepareNavigationPhoto(photo("north")),
      old = leases[0];
    fireEvent.pointerDown(element, {
      pointerId: 11,
      button: 0,
      clientX: width / 2,
      clientY: height / 2,
    });
    fireEvent.pointerMove(element, {
      pointerId: 11,
      buttons: 1,
      clientX: width / 2 + 20,
      clientY: height / 2,
    });
    const count = old.setViewport.mock.calls.length;
    result.rerender(
      <ObliqueObjectCoverage
        map={map}
        sphere={{ ...sphere, radiusMeters: 8 }}
        groups={groups}
        onOpen={onOpen}
      />
    );
    act(() => vi.advanceTimersByTime(30));
    expect(photo("north")).not.toBe(element);
    expect(element.releasePointerCapture).toHaveBeenCalledWith(11);
    expect(old.release).toHaveBeenCalledOnce();
    expect(old.setViewport).toHaveBeenCalledTimes(count);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("shares physical pan and zoom across all four calibrated views with stable viewport handles", () => {
    const leases = captureViewports();
    const result = fourViews();
    const before = result.elements.map(viewportCrop);
    const sync = screen.getByRole("button", {
      name: "Ansichten synchronisieren",
    });
    expect(sync.getAttribute("aria-pressed")).toBe("true");
    dragPhoto(result.elements[0]);
    const panned = result.elements.map(viewportCrop);
    expect(panned[0][0]).not.toBeCloseTo(before[0][0], 6);
    expect(panned[1][1]).not.toBeCloseTo(before[1][1], 6);
    expect(panned[0][0] - before[0][0]).toBeCloseTo(
      -(panned[2][0] - before[2][0]),
      7
    );
    expect(panned[1][1] - before[1][1]).toBeCloseTo(
      -(panned[3][1] - before[3][1]),
      7
    );
    fireEvent.wheel(result.elements[1], {
      deltaY: -100,
      clientX: width / 2,
      clientY: height / 2,
      cancelable: true,
    });
    for (let i = 0; i < 4; i++) {
      const zoomed = viewportCrop(result.elements[i]);
      expect(zoomed[2]).toBeCloseTo(panned[i][2] / Math.exp(0.2), 7);
      expect(zoomed[3]).toBeCloseTo(panned[i][3] / Math.exp(0.2), 7);
      expect(leases[i].setViewport.mock.calls.length).toBeGreaterThan(1);
      expect(leases[i].release).not.toHaveBeenCalled();
    }
    expect(leases).toHaveLength(4);
    expect(scene.acquire).not.toHaveBeenCalled();
    expect(result.elements[0].setPointerCapture).toHaveBeenCalledWith(7);
    expect(result.elements[0].releasePointerCapture).toHaveBeenCalledWith(7);
    const toolbar = screen.getByRole("toolbar", {
      name: "Objektansichten-Werkzeuge",
    });
    expect(
      toolbar.querySelector(".oblique-object-coverage-title")
    ).not.toBeNull();
    expect(
      toolbar.querySelector(".oblique-object-coverage-actions")?.contains(sync)
    ).toBe(true);
  });
  it("unlinks one quadrant and re-enables synchronization from the last active quadrant", () => {
    captureViewports();
    const result = fourViews();
    const before = result.elements.map(viewportCrop);
    const sync = screen.getByRole("button", {
      name: "Ansichten synchronisieren",
    });
    fireEvent.click(sync);
    expect(sync.getAttribute("aria-pressed")).toBe("false");
    dragPhoto(result.elements[1], 0, 12);
    fireEvent.wheel(result.elements[1], {
      deltaY: -100,
      clientX: width / 2,
      clientY: height / 2,
    });
    const local = viewportCrop(result.elements[1]);
    expect(local).not.toEqual(before[1]);
    for (const index of [0, 2, 3])
      expect(viewportCrop(result.elements[index])).toEqual(before[index]);
    fireEvent.click(sync);
    expect(sync.getAttribute("aria-pressed")).toBe("true");
    expect(viewportCrop(result.elements[1])).toEqual(local);
    for (const index of [0, 2, 3]) {
      const current = viewportCrop(result.elements[index]);
      expect(current).not.toEqual(before[index]);
      expect(current[2] / before[index][2]).toBeCloseTo(
        local[2] / before[1][2],
        8
      );
    }
  });
  it("positions late pooled pixels against the current crop without renewing the source", () => {
    const leases = captureViewports();
    const result = fourViews();
    const first = leases[0];
    const oldWindow = first.setViewport.mock.lastCall![0];
    dragPhoto(result.elements[0]);
    const current = viewportCrop(result.elements[0]);
    act(() => first.publish({ bitmap: bitmap(), frame: oldWindow }));
    const canvas = within(result.elements[0]).getByLabelText(
      "north Objektausschnitt"
    );
    expect(parseFloat(canvas.style.left)).toBeCloseTo(
      (100 * (oldWindow.source.x - current[0])) / current[2],
      7
    );
    expect(leases).toHaveLength(4);
  });
  it("suppresses the drag click and cancels queued movement and capture on unmount", () => {
    const leases = captureViewports();
    const surfacePicker = { intersectSurface: vi.fn(() => null) };
    const result = render(
      <ObliqueObjectCoverage
        map={map}
        sphere={sphere}
        groups={groupsOf([imageOf("north")])}
        surfacePicker={surfacePicker}
        onOpen={vi.fn()}
      />
    );
    const element = prepareNavigationPhoto(photo("north"));
    fireEvent.click(screen.getByRole("button", { name: "Strecke messen" }));
    dragPhoto(element);
    fireEvent.click(element, { clientX: width / 2 + 12, clientY: height / 2 });
    expect(surfacePicker.intersectSurface).not.toHaveBeenCalled();
    fireEvent.pointerDown(element, {
      pointerId: 9,
      button: 0,
      clientX: width / 2,
      clientY: height / 2,
    });
    fireEvent.pointerMove(element, {
      pointerId: 9,
      buttons: 1,
      clientX: width / 2 + 20,
      clientY: height / 2,
    });
    const updates = leases[0].setViewport.mock.calls.length;
    result.unmount();
    act(() => vi.advanceTimersByTime(50));
    expect(element.releasePointerCapture).toHaveBeenCalledWith(9);
    expect(leases[0].setViewport).toHaveBeenCalledTimes(updates);
    expect(leases[0].release).toHaveBeenCalledOnce();
  });
  it.each(["mesh", "terrain", "auto"] as const)(
    "redefines center and radius from different calibrated photos on %s without closing",
    (surfaceMode) => {
      captureViewports();
      const onRegionChange = vi.fn(),
        onReset = vi.fn(),
        onCancel = vi.fn(),
        onOpen = vi.fn();
      const points = [new Vector3(1, 2, 3), new Vector3(4, 6, 3)];
      const surfacePicker = {
        intersectSurface: vi.fn(
          (_ray: Raycaster, _location: [number, number], _mode: string) => ({
            point: points.shift()!,
            surface: "terrain" as const,
          })
        ),
      };
      const north = imageOf("north"),
        east = imageOf("east");
      east.dataset = {
        ...east.dataset,
        cameras: { test: { ...calibration, principalPointPx: [1100, 499.5] } },
      };
      render(
        <ObliqueObjectCoverage
          map={map}
          sphere={sphere}
          groups={groupsOf([north], [east])}
          surfacePicker={surfacePicker}
          surfaceMode={surfaceMode}
          onOpen={onOpen}
          onReset={onReset}
          onCancel={onCancel}
          onRegionChange={onRegionChange}
        />
      );
      const center = prepareNavigationPhoto(photo("north")),
        edge = prepareNavigationPhoto(photo("east"));
      fireEvent.click(
        screen.getByRole("button", {
          name: "Zentrum und Ausschnitt neu definieren",
        })
      );
      fireEvent.click(center, { clientX: width / 2, clientY: height / 2 });
      expect(onRegionChange).not.toHaveBeenCalled();
      fireEvent.click(edge, { clientX: width / 2, clientY: height / 2 });
      expect(onRegionChange).toHaveBeenCalledOnce();
      expect(onRegionChange.mock.lastCall![0].radiusMeters).toBeCloseTo(5, 6);
      expect(onRegionChange.mock.lastCall![0].center.heightMeters).toBeCloseTo(
        2,
        5
      );
      expect(
        surfacePicker.intersectSurface.mock.calls.map((call) => call[2])
      ).toEqual([surfaceMode, surfaceMode]);
      const rays = surfacePicker.intersectSurface.mock.calls.map(
        (call) => call[0] as Raycaster
      );
      expect(
        rays[0].ray.direction.distanceTo(rays[1].ray.direction)
      ).toBeGreaterThan(0.01);
      expect(onReset).not.toHaveBeenCalled();
      expect(onCancel).not.toHaveBeenCalled();
      expect(onOpen).not.toHaveBeenCalled();
      expect(photo("north")).toBe(center);
      expect(photo("east")).toBe(edge);
      expect(
        screen.getByRole("button", {
          name: "Zentrum und Ausschnitt neu definieren",
        })
      ).toBeTruthy();
    }
  );
  it("discards an unfinished new center when canceled and preserves the existing selected region", () => {
    captureViewports();
    const onRegionChange = vi.fn();
    const surfacePicker = {
      intersectSurface: vi.fn(() => ({
        point: new Vector3(1, 0, 0),
        surface: "mesh" as const,
      })),
    };
    render(
      <ObliqueObjectCoverage
        map={map}
        sphere={sphere}
        groups={groupsOf([imageOf("north")])}
        surfacePicker={surfacePicker}
        onOpen={vi.fn()}
        onRegionChange={onRegionChange}
      />
    );
    const element = prepareNavigationPhoto(photo("north"));
    const before = viewportCrop(element);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Zentrum und Ausschnitt neu definieren",
      })
    );
    fireEvent.click(element, { clientX: width / 2, clientY: height / 2 });
    fireEvent.click(
      screen.getByRole("button", { name: "Neudefinition abbrechen" })
    );
    fireEvent.click(element, { clientX: width / 2 + 10, clientY: height / 2 });
    expect(onRegionChange).not.toHaveBeenCalled();
    expect(surfacePicker.intersectSurface).toHaveBeenCalledOnce();
    expect(viewportCrop(element)).toEqual(before);
  });
});

const drawingSetup = () => {
  const leases = captureViewports();
  const result = fourViews(true);
  let point = new Vector3(1, 2, 3);
  const surfacePicker = {
    intersectSurface: vi.fn((_ray: Raycaster) => ({
      point: point.clone(),
      surface: "mesh" as const,
    })),
  };
  const onRegionChange = vi.fn(),
    onRegionDraft = vi.fn();
  result.rerender(
    <div data-oblique-object-window="true">
      <ObliqueObjectCoverage
        map={map}
        sphere={sphere}
        groups={result.groups}
        surfacePicker={surfacePicker}
        onOpen={vi.fn()}
        onRegionChange={onRegionChange}
        onRegionDraft={onRegionDraft}
        outlineColor="#123abc"
      />
    </div>
  );
  const queued = new Map<number, FrameRequestCallback>();
  let sequence = 0;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    const id = ++sequence;
    queued.set(id, callback);
    return id;
  });
  const cancel = vi
    .spyOn(window, "cancelAnimationFrame")
    .mockImplementation((id) => {
      queued.delete(id);
    });
  const frame = (time: number) =>
    act(() => {
      const current = [...queued.values()];
      queued.clear();
      for (const callback of current) callback(time);
    });
  const hover = (index: number, x = width / 2, y = height / 2) =>
    fireEvent.pointerMove(result.elements[index], {
      pointerId: 7,
      buttons: 0,
      clientX: x,
      clientY: y,
    });
  fireEvent.click(
    screen.getByRole("button", {
      name: "Zentrum und Ausschnitt neu definieren",
    })
  );
  return {
    ...result,
    leases,
    surfacePicker,
    onRegionChange,
    onRegionDraft,
    queued,
    cancel,
    frame,
    hover,
    setPoint: (next: Vector3) => {
      point = next;
    },
  };
};

describe("calibrated live region drawing", () => {
  it("coalesces all photo hover moves into one surface point at no more than thirty updates per second", () => {
    const view = drawingSetup();
    const before = view.leases.map(
      (lease) => lease.setViewport.mock.calls.length
    );
    for (let i = 0; i < 25; i++) view.hover(i % 4, width / 2 + i, height / 2);
    expect(view.surfacePicker.intersectSurface).not.toHaveBeenCalled();
    expect(view.queued.size).toBe(1);
    view.frame(0);
    expect(view.surfacePicker.intersectSurface).toHaveBeenCalledOnce();
    expect(
      document.querySelectorAll(
        '[data-test-id="oblique-coverage-draft-center"]'
      )
    ).toHaveLength(4);
    view.hover(1);
    view.frame(10);
    expect(view.surfacePicker.intersectSurface).toHaveBeenCalledOnce();
    view.hover(3);
    view.frame(34);
    expect(view.surfacePicker.intersectSurface).toHaveBeenCalledTimes(2);
    view.hover(0);
    view.frame(50);
    expect(view.surfacePicker.intersectSurface).toHaveBeenCalledTimes(2);
    view.frame(68);
    expect(view.surfacePicker.intersectSurface).toHaveBeenCalledTimes(3);
    expect(view.leases).toHaveLength(4);
    expect(
      view.leases.map((lease) => lease.setViewport.mock.calls.length)
    ).toEqual(before);
    expect(view.onRegionChange).not.toHaveBeenCalled();
  });

  it("resets the hover clock when the same live photo moves into a popup with a different time origin", () => {
    const view = drawingSetup();
    view.hover(0);
    view.frame(100000);
    expect(view.surfacePicker.intersectSurface).toHaveBeenCalledOnce();
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);
    const popup = iframe.contentWindow!;
    Object.defineProperty(popup, "PointerEvent", {
      configurable: true,
      value: PointerEvent,
    });
    const queued = new Map<number, FrameRequestCallback>();
    let id = 0;
    Object.defineProperty(popup, "requestAnimationFrame", {
      configurable: true,
      value: (callback: FrameRequestCallback) => {
        queued.set(++id, callback);
        return id;
      },
    });
    Object.defineProperty(popup, "cancelAnimationFrame", {
      configurable: true,
      value: (key: number) => queued.delete(key),
    });
    try {
      popup.document.body.appendChild(view.container);
      view.hover(1);
      expect(queued.size).toBe(1);
      act(() => {
        const callbacks = [...queued.values()];
        queued.clear();
        callbacks.forEach((callback) => callback(10));
      });
      expect(view.surfacePicker.intersectSurface).toHaveBeenCalledTimes(2);
      expect(queued.size).toBe(0);
      expect(view.leases).toHaveLength(4);
    } finally {
      view.unmount();
      iframe.remove();
    }
  });

  it("cancels an old document's pending pick as soon as the portal reports reparenting", () => {
    const view = drawingSetup();
    view.hover(0);
    const stale = [...view.queued.values()][0];
    act(() =>
      view.container
        .querySelector("[data-oblique-object-window]")!
        .dispatchEvent(new Event("oblique-object-window-change"))
    );
    expect(view.queued.size).toBe(0);
    act(() => stale(100000));
    expect(view.surfacePicker.intersectSurface).not.toHaveBeenCalled();
    expect(view.leases).toHaveLength(4);
  });

  it("projects one physical center, sphere silhouette and radius into all four calibrated photos and commits the same north-to-east sphere", () => {
    const view = drawingSetup();
    const center = new Vector3(1, 2, 3),
      edge = new Vector3(4, 6, 3);
    fireEvent.click(view.elements[0], {
      clientX: width / 2,
      clientY: height / 2,
    });
    view.setPoint(edge);
    view.hover(1);
    view.frame(0);
    expect(view.surfacePicker.intersectSurface).toHaveBeenCalledTimes(2);
    expect(view.onRegionChange).not.toHaveBeenCalled();
    const draft = view.onRegionDraft.mock.lastCall![0];
    expect(draft.radiusMeters).toBeCloseTo(5, 6);
    for (let index = 0; index < 4; index++) {
      const image = view.groups.get(index as 0 | 1 | 2 | 3)![0],
        element = view.elements[index];
      const [x, y, w, h] = viewportCrop(element);
      const display = (pixel: { x: number; y: number }) => ({
        x: ((pixel.x - x) * width) / w,
        y: ((pixel.y - y) * height) / h,
      });
      const expectedCenter = display(
        projectObjectCoveragePoint(image.projection!, center, calibration)!
      );
      const svg = element.querySelector(
        '[data-test-id="oblique-coverage-region-draft"]'
      )!;
      const centerPath = svg
        .querySelector('[data-test-id="oblique-coverage-draft-center"]')!
        .getAttribute("d")!;
      const numbers = centerPath
        .match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/g)!
        .map(Number);
      expect(numbers[0] + 7).toBeCloseTo(expectedCenter.x, 4);
      expect(numbers[1]).toBeCloseTo(expectedCenter.y, 4);
      const polygon = svg.querySelector("polygon")!;
      expect(polygon.getAttribute("stroke")).toBe("#123abc");
      expect(polygon.getAttribute("fill-opacity")).toBe("0.3");
      const actual = polygon
        .getAttribute("points")!
        .split(" ")
        .map((pair) => pair.split(",").map(Number));
      const expected = projectObjectCoverageOutline(image, sphere, center, 5)!;
      expect(actual).toHaveLength(48);
      expected.forEach((pixel, i) => {
        const point = display(pixel);
        expect(actual[i][0]).toBeCloseTo(point.x, 4);
        expect(actual[i][1]).toBeCloseTo(point.y, 4);
      });
      const line = svg.querySelector("line")!,
        end = display(
          projectObjectCoveragePoint(image.projection!, edge, calibration)!
        );
      expect(Number(line.getAttribute("x2"))).toBeCloseTo(end.x, 4);
      expect(Number(line.getAttribute("y2"))).toBeCloseTo(end.y, 4);
      expect(svg.querySelector("text")?.textContent).toBe("5 m");
    }
    fireEvent.click(view.elements[1], {
      clientX: width / 2,
      clientY: height / 2,
    });
    expect(view.onRegionChange).toHaveBeenCalledOnce();
    expect(view.onRegionChange.mock.lastCall![0]).toEqual(draft);
    expect(view.onRegionDraft).toHaveBeenLastCalledWith(null);
    expect(
      document.querySelector('[data-test-id="oblique-coverage-region-draft"]')
    ).toBeNull();
    expect(view.leases).toHaveLength(4);
    expect(
      view.leases.every((lease) => lease.release.mock.calls.length === 0)
    ).toBe(true);
  });

  it.each(["cancel", "unmount"] as const)(
    "clears live drawing and cancels pending hover work on %s",
    (action) => {
      const view = drawingSetup();
      fireEvent.click(view.elements[0], {
        clientX: width / 2,
        clientY: height / 2,
      });
      view.setPoint(new Vector3(4, 6, 3));
      view.hover(1);
      view.frame(0);
      expect(view.onRegionDraft.mock.lastCall![0]).not.toBeNull();
      view.hover(2);
      const stale = [...view.queued.values()][0];
      const count = view.surfacePicker.intersectSurface.mock.calls.length;
      if (action === "cancel")
        fireEvent.click(
          screen.getByRole("button", { name: "Neudefinition abbrechen" })
        );
      else view.unmount();
      expect(view.queued.size).toBe(0);
      expect(view.cancel).toHaveBeenCalled();
      act(() => stale(100));
      expect(view.surfacePicker.intersectSurface).toHaveBeenCalledTimes(count);
      expect(view.onRegionDraft).toHaveBeenLastCalledWith(null);
      expect(view.onRegionChange).not.toHaveBeenCalled();
      expect(
        document.querySelector('[data-test-id="oblique-coverage-region-draft"]')
      ).toBeNull();
    }
  );
});

describe("shared physical measurements in object photographs", () => {
  it.each(["mesh", "terrain", "auto"] as const)(
    "uses the shared %s surface picker once per photo click and clones its physical hit for every photograph",
    (surfaceMode) => {
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
      const [ray, location, selectedSurface] = surfacePicker.intersectSurface
        .mock.lastCall! as unknown as [Raycaster, [number, number], string];
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
    }
  );

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
  ] as const)(
    "filters fallback %s receivers using DEM %s identification",
    (surfaceMode, identification) => {
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
        surfaceMode === "mesh"
          ? [ground]
          : surfaceMode === "terrain"
          ? [decorative]
          : [ground, decorative],
        false
      );
    }
  );

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
