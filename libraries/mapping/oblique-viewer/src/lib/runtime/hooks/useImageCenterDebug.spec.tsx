vi.mock("../utils/image-selection-ecef", () => ({
  physicalImageQueryTarget: async (target: any) => ({
    ...target,
    ecefMeters: [target.longitude, target.latitude, target.heightMeters ?? 0],
  }),
}));
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Matrix3, Matrix4, Object3D, Ray, Vector3 } from "three";
import type { Map as MaplibreMap } from "maplibre-gl";
import type { ObliqueImageRecord } from "../../core/types";
import type { ScenePreviewPhoto } from "./useScenePreviewImage";
import { useImageCenterDebug } from "./useImageCenterDebug";

const shared = vi.hoisted(() => ({
  layer: null as any,
  projection: vi.fn(),
  enu: vi.fn(),
  pixel: vi.fn(),
  runtimes: [] as any[],
  release: vi.fn(),
  terrain: null as (() => void) | null,
}));
vi.mock("@carma-mapping/engines/maplibre", () => ({
  acquireSharedThreeScene: () => ({
    layer: shared.layer,
    release: shared.release,
  }),
  getSharedThreeSceneRuntimes: () => shared.runtimes,
  subscribeSharedThreeTerrain: (_map: unknown, callback: () => void) => {
    shared.terrain = callback;
    return () => {
      shared.terrain = null;
    };
  },
}));
vi.mock("../../core/utils/image-projection", () => ({
  imageProjectionMatrix: shared.projection,
  sceneToPhotoEnu: shared.enu,
}));
vi.mock("../../core/utils/object-coverage", () => ({
  objectCoveragePixelRay: (
    _projection: Matrix4,
    eye: Vector3,
    pixel: { x: number; y: number },
    calibration: { widthPx: number; heightPx: number }
  ) =>
    new Ray(
      eye.clone(),
      new Vector3(
        pixel.x / calibration.widthPx - 0.5,
        0.5 - pixel.y / calibration.heightPx,
        -1
      ).normalize()
    ),
  projectObjectCoveragePoint: shared.pixel,
}));

vi.mock("../../core/utils/photo-center-rays", async () => {
  const actual = await vi.importActual<
    typeof import("../../core/utils/photo-center-rays")
  >("../../core/utils/photo-center-rays");
  return {
    ...actual,
    presentationPointToScene: (p: {
      longitude: number;
      latitude: number;
      heightMeters: number;
    }) => new Vector3(p.longitude, p.latitude, p.heightMeters),
    sceneToPresentationPoint: (p: Vector3) => ({
      longitude: p.x,
      latitude: p.y,
      heightMeters: p.z,
    }),
  };
});

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  shared.projection.mockImplementation(() =>
    new Matrix4().set(1, 0, -0.5, 0, 0, 1, -0.5, 0, 0, 0, -1, 0, 0, 0, -1, 0)
  );
  // A downward photo ray meets the ground at the fixture centre, not at its eye.
  shared.enu.mockImplementation(() =>
    new Matrix4().makeTranslation(-0.2, -0.1, -10)
  );
  shared.pixel.mockReturnValue({ x: 50, y: 70 });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const setup = (
  overrides: Partial<Parameters<typeof useImageCenterDebug>[0]> = {}
) => {
  const painted: string[] = [];
  let path: number[][] = [];
  const strokes: {
    color: string;
    points: number[][];
    width: number;
    alpha: number;
    dash: number[];
  }[] = [];
  const labels: {
    text: string;
    x: number;
    y: number;
    baseline: string;
    font: string;
    angle: number;
    origin: number[];
  }[] = [];
  let dash: number[] = [];
  let angle = 0;
  let textOrigin = [0, 0];
  const context = {
    setTransform: vi.fn(),
    clearRect: vi.fn(() => {
      painted.length = 0;
      labels.length = 0;
    }),
    beginPath: vi.fn(() => {
      path = [];
    }),
    moveTo: vi.fn((x: number, y: number) => {
      path.push([x, y]);
    }),
    lineTo: vi.fn((x: number, y: number) => {
      path.push([x, y]);
    }),
    strokeStyle: "",
    lineWidth: 1,
    globalAlpha: 1,
    textBaseline: "alphabetic",
    font: "",
    translate: vi.fn((x: number, y: number) => {
      textOrigin = [x, y];
    }),
    rotate: vi.fn((value: number) => {
      angle = value;
    }),
    setLineDash: vi.fn((value: number[]) => {
      dash = [...value];
    }),
    stroke: vi.fn((): void => {
      strokes.push({
        color: context.strokeStyle,
        width: context.lineWidth,
        alpha: context.globalAlpha,
        dash: [...dash],
        points: path.map((p) => [...p]),
      });
    }),
    arc: vi.fn(),
    fill: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    strokeText: vi.fn(),
    fillText: vi.fn((text: string, x: number, y: number) => {
      painted.push(text);
      labels.push({
        text,
        x,
        y,
        baseline: context.textBaseline,
        font: context.font,
        angle,
        origin: [...textOrigin],
      });
    }),
    fillRect: vi.fn(),
    measureText: (text: string) => ({ width: text.length * 6 }),
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    context as unknown as CanvasRenderingContext2D
  );
  const container = document.createElement("div");
  vi.spyOn(container, "getBoundingClientRect").mockReturnValue({
    left: 20,
    top: 30,
    width: 400,
    height: 300,
  } as DOMRect);
  const listeners = new Map<string, () => void>();
  const map = {
    transform: { width: 400, height: 300 },
    getCanvasContainer: () => container,
    getCenterElevation: () => 0,
    triggerRepaint: vi.fn(),
    on: vi.fn((name: string, callback: () => void) => {
      listeners.set(name, callback);
    }),
    off: vi.fn((name: string) => {
      listeners.delete(name);
    }),
  } as unknown as MaplibreMap;
  let beforeRender: ((frame: any) => void) | undefined;
  let version = 1;
  shared.runtimes = [
    {
      id: "surface",
      root: new Object3D(),
      hasRenderableContent: () => true,
      mapStyleProjectionVersion: () => version,
    },
  ];
  shared.layer = {
    getLocalFrame: () => ({ sceneFromLocal: new Matrix4() }),
    projectSceneToLngLat: (point: Vector3 | number[]) =>
      Array.isArray(point) ? [0, 0] : [point.x, point.y],
    projectLngLatToScene: ([x, y]: number[], height: number) =>
      new Vector3(x, y, height),
    addBeforeRenderCallback: (callback: (frame: any) => void) => {
      beforeRender = callback;
      return () => {
        beforeRender = undefined;
      };
    },
  };
  let records = [
    {
      id: "photo",
      sourceId: "SOURCE_01",
      seriesId: "series",
      x: 0,
      y: 0,
      z: 10,
      m: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      centerWGS84: [0, 0, 10],
      catalogCenter: {
        longitude: 0.2,
        latitude: 0.1,
        heightMeters: 0,
        ecefMeters: [0, 0, 0],
      },
      fallbackHeading: 0,
      sector: 0,
    },
  ] as ObliqueImageRecord[];
  const photo = {
    record: records[0],
    calibration: { widthPx: 100, heightPx: 100 },
    pose: { longitude: 0, latitude: 0 },
    altitude: 10,
  } as unknown as ScenePreviewPhoto;
  const resolvePhoto = vi.fn().mockResolvedValue(photo);
  const intersectSurface = vi.fn(() => ({ point: new Vector3(0.2, 0.1, 0) }));
  const options: Parameters<typeof useImageCenterDebug>[0] = {
    map,
    enabled: true,
    readRecords: () => records,
    selectedId: "photo",
    centerY: 0.3,
    surfaceMode: "auto" as const,
    resolvePhoto,
    readTarget: () => ({ longitude: 0.2, latitude: 0.1, heightMeters: 0 }),
    intersectSurface,
    ...overrides,
  };
  const view = renderHook(useImageCenterDebug, { initialProps: options });
  const render = (offset = 0) =>
    act(() => {
      beforeRender?.({
        renderCamera: {
          projectionMatrix: new Matrix4().makeTranslation(offset, 0, 0),
          matrixWorldInverse: new Matrix4(),
        },
      });
      listeners.get("render")?.();
    });
  const settle = async () => {
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    render();
  };
  const bumpSurface = () =>
    act(() => {
      version++;
      listeners.get("idle")?.();
    });
  return {
    ...view,
    options,
    container,
    render,
    settle,
    bumpSurface,
    painted,
    strokes,
    labels,
    context,
    resolvePhoto,
    intersectSurface,
    photo,
    setRecord: (record: ObliqueImageRecord) => {
      records = [record];
    },
    setRecords: (next: ObliqueImageRecord[]) => {
      records = next;
    },
    getRecord: () => records[0],
  };
};

describe("image-center debug render stability", () => {
  it("ignores surface revisions and retains stored centers without depth sampling", async () => {
    const view = setup();
    view.render();
    await view.settle();
    expect(view.painted.some((text) => text.startsWith("V "))).toBe(true);
    expect(view.painted.join(" ")).not.toMatch(
      /SOURCE_01|photo|Optische|Bildmitte|Kamera/
    );
    expect(view.context.arc).not.toHaveBeenCalled();
    const rays = view.intersectSurface.mock.calls.length;
    view.bumpSurface();
    view.render();
    expect(view.painted.some((text) => text.startsWith("V "))).toBe(true);
    expect(view.painted.join(" ")).not.toMatch(
      /SOURCE_01|photo|Optische|Bildmitte|Kamera/
    );
    expect(view.context.arc).not.toHaveBeenCalled();
    expect(view.intersectSurface).toHaveBeenCalledTimes(rays);
    await view.settle();
    expect(view.intersectSurface).not.toHaveBeenCalled();
    expect(view.painted.some((text) => text.startsWith("V "))).toBe(true);
    expect(view.painted.join(" ")).not.toMatch(
      /SOURCE_01|photo|Optische|Bildmitte|Kamera/
    );
    expect(view.context.arc).not.toHaveBeenCalled();
    view.unmount();
  });

  it("keeps the last photo geometry and label until a replacement resolver completes", async () => {
    const view = setup();
    view.render();
    await view.settle();
    expect(view.painted.some((text) => text.startsWith("V "))).toBe(true);
    expect(view.painted.join(" ")).not.toMatch(
      /SOURCE_01|photo|Optische|Bildmitte|Kamera/
    );
    expect(view.context.arc).not.toHaveBeenCalled();
    const replacement = deferred<ScenePreviewPhoto>();
    const resolvePhoto = vi.fn(() => replacement.promise);
    view.rerender({ ...view.options, resolvePhoto });
    view.render();
    await view.settle();
    expect(resolvePhoto).toHaveBeenCalledOnce();
    expect(view.painted.some((text) => text.startsWith("V "))).toBe(true);
    expect(view.painted.join(" ")).not.toMatch(
      /SOURCE_01|photo|Optische|Bildmitte|Kamera/
    );
    expect(view.context.arc).not.toHaveBeenCalled();
    await act(async () => replacement.resolve(view.photo));
    view.render();
    expect(view.painted.some((text) => text.startsWith("V "))).toBe(true);
    expect(view.painted.join(" ")).not.toMatch(
      /SOURCE_01|photo|Optische|Bildmitte|Kamera/
    );
    expect(view.context.arc).not.toHaveBeenCalled();
    view.unmount();
  });

  it("does not clear or repaint the 2D canvas for identical rendered frames", async () => {
    const view = setup();
    view.render();
    await view.settle();
    const samples = view.intersectSurface.mock.calls.length;
    view.context.clearRect.mockClear();
    view.context.fillText.mockClear();
    view.render();
    view.render();
    view.render();
    expect(view.context.clearRect).not.toHaveBeenCalled();
    expect(view.context.fillText).not.toHaveBeenCalled();
    expect(view.intersectSurface).toHaveBeenCalledTimes(samples);
    view.unmount();
  });

  it("retains prepared geometry when a record is replaced with metadata-only changes", async () => {
    const view = setup();
    view.render();
    await view.settle();
    const rays = view.intersectSurface.mock.calls.length;
    const photos = view.resolvePhoto.mock.calls.length;
    view.setRecord({
      ...view.getRecord(),
      footprintApproximate: true,
      footprint: [
        [0, 0],
        [1, 0],
        [1, 1],
      ],
    });
    view.render();
    await view.settle();
    expect(view.intersectSurface).toHaveBeenCalledTimes(rays);
    expect(view.resolvePhoto).toHaveBeenCalledTimes(photos);
    expect(view.painted.some((text) => text.startsWith("V "))).toBe(true);
    expect(view.painted.join(" ")).not.toMatch(
      /SOURCE_01|photo|Optische|Bildmitte|Kamera/
    );
    expect(view.context.arc).not.toHaveBeenCalled();
    view.unmount();
  });
});

describe("image-center debug pointer and selected-camera markers", () => {
  const ground = { longitude: 0.2, latitude: 0.1, heightMeters: 0 };
  const move = (container: HTMLElement, x: number, y: number) =>
    act(() => {
      container.dispatchEvent(
        new MouseEvent("pointermove", { clientX: x + 20, clientY: y + 30 })
      );
    });
  const advance = async (ms: number) =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  it("coalesces pointer position for 40ms, uses container CSS coordinates, and clears pending work on leave/unmount", async () => {
    const readPointerTarget = vi.fn(() => ground);
    const view = setup({ readPointerTarget, readTarget: () => ground });
    view.render();
    await view.settle();
    const samples = view.intersectSurface.mock.calls.length;
    move(view.container, 70, 80);
    move(view.container, 110, 120);
    view.render();
    expect(view.painted.some((text) => text.startsWith("M "))).toBe(false);
    await advance(39);
    expect(readPointerTarget).not.toHaveBeenCalled();
    await advance(1);
    view.render();
    expect(readPointerTarget).toHaveBeenCalledOnce();
    expect(readPointerTarget).toHaveBeenCalledWith({
      x: 110,
      y: 120,
    });
    expect(view.painted.some((text) => /^M \d+ px$/.test(text))).toBe(true);
    expect(view.painted.some((text) => /^V \d+ px$/.test(text))).toBe(true);
    move(view.container, 110, 120);
    view.render();
    await advance(100);
    expect(readPointerTarget).toHaveBeenCalledOnce();
    expect(view.intersectSurface).toHaveBeenCalledTimes(samples);
    move(view.container, 150, 120);
    view.render();
    expect(view.painted.some((text) => /^M \d+ px$/.test(text))).toBe(true);
    act(() => view.container.dispatchEvent(new Event("pointerleave")));
    await advance(100);
    view.render();
    expect(readPointerTarget).toHaveBeenCalledOnce();
    expect(view.painted.some((text) => text.startsWith("M "))).toBe(false);
    expect(view.painted.some((text) => /^M /.test(text))).toBe(false);
    move(view.container, 180, 150);
    const remove = vi.spyOn(view.container, "removeEventListener");
    view.unmount();
    expect(remove).toHaveBeenCalledWith("pointermove", expect.any(Function));
    expect(remove).toHaveBeenCalledWith("pointerleave", expect.any(Function));
    expect(view.container.querySelector("canvas")).toBeNull();
    await advance(100);
    move(view.container, 200, 200);
    await advance(100);
    expect(readPointerTarget).toHaveBeenCalledOnce();
  });
  it("resamples a stationary pointer once after a camera change, but not for identical frames", async () => {
    const readPointerTarget = vi.fn(() => ground);
    const view = setup({ readPointerTarget });
    view.render();
    await view.settle();
    move(view.container, 50, 60);
    await advance(40);
    view.render();
    expect(readPointerTarget).toHaveBeenCalledOnce();
    view.render(1);
    view.render(1);
    view.render(1);
    await advance(40);
    view.render(1);
    expect(readPointerTarget).toHaveBeenCalledTimes(2);
    await advance(100);
    expect(readPointerTarget).toHaveBeenCalledTimes(2);
    view.unmount();
  });
  it("resamples a stationary pointer after reader and surface-mode changes while ignoring surface revisions", async () => {
    const originalReader = vi.fn(() => ground);
    const view = setup({ readPointerTarget: originalReader });
    view.render();
    await view.settle();
    move(view.container, 80, 90);
    await advance(40);
    view.render();
    expect(originalReader).toHaveBeenCalledOnce();
    const nextReader = vi.fn((): typeof ground | null => null);
    const nextOptions = { ...view.options, readPointerTarget: nextReader };
    view.rerender(nextOptions);
    view.render();
    view.render();
    await advance(39);
    expect(nextReader).not.toHaveBeenCalled();
    expect(view.painted.some((text) => /^M \d+ px$/.test(text))).toBe(true);
    await advance(1);
    view.render();
    expect(nextReader).toHaveBeenCalledOnce();
    expect(nextReader).toHaveBeenLastCalledWith({ x: 80, y: 90 });
    expect(view.painted.some((text) => text.startsWith("M "))).toBe(false);
    nextReader.mockReturnValue(ground);
    view.bumpSurface();
    view.render();
    view.render();
    await advance(40);
    view.render();
    expect(nextReader).toHaveBeenCalledTimes(1);
    expect(view.painted.some((text) => /^M \d+ px$/.test(text))).toBe(false);
    view.rerender({ ...nextOptions, surfaceMode: "terrain" });
    view.render();
    view.render();
    await advance(40);
    view.render();
    expect(nextReader).toHaveBeenCalledTimes(2);
    expect(originalReader).toHaveBeenCalledOnce();
    await advance(100);
    view.render();
    expect(nextReader).toHaveBeenCalledTimes(2);
    view.unmount();
  });

  it("keeps the geometric midpoint fixed under slider changes and aligns the cross with photo-up using no surface ray", async () => {
    const mapping = {
      imageId: "photo",
      viewport: { width: 400, height: 300 },
      viewportToImage: new Matrix3().set(2, 0.5, -0.25, 0, 1, 0.1, 0, 0, 1),
    };
    const view = setup({
      readPlaneMapping: () => mapping as never,
      readTarget: () => ground,
    });
    view.render();
    await view.settle();
    const last = (color: string) =>
      view.strokes.filter((stroke) => stroke.color === color).at(-1)!.points;
    const point = (uvY: number) => {
      const p = new Vector3(0.5, uvY, 1).applyMatrix3(
        mapping.viewportToImage.clone().invert()
      );
      return { x: (p.x / p.z) * 400, y: (1 - p.y / p.z) * 300 };
    };
    const position = point(0.5),
      up = point(0.51);
    const opticalPosition = point(0.3);
    expect(view.intersectSurface).not.toHaveBeenCalled();
    const opticalExpected = [
      [opticalPosition.x - 7, opticalPosition.y],
      [opticalPosition.x + 7, opticalPosition.y],
      [opticalPosition.x, opticalPosition.y - 7],
      [opticalPosition.x, opticalPosition.y + 7],
    ];
    last("#61ff9a").forEach((p, i) =>
      p.forEach((n, j) => expect(n).toBeCloseTo(opticalExpected[i][j]))
    );

    const dx = up.x - position.x,
      dy = up.y - position.y,
      length = Math.hypot(dx, dy);
    const ux = dx / length,
      uy = dy / length;
    const expected = [
      [position.x - (ux - uy) * 5, position.y - (uy + ux) * 5],
      [position.x + (ux - uy) * 5, position.y + (uy + ux) * 5],
      [position.x - (ux + uy) * 5, position.y - (uy - ux) * 5],
      [position.x + (ux + uy) * 5, position.y + (uy - ux) * 5],
    ];
    last("#ae94ff").forEach((p, i) =>
      p.forEach((n, j) => expect(n).toBeCloseTo(expected[i][j]))
    );
    expect(view.context.arc).not.toHaveBeenCalled();
    expect(
      view.painted.every(
        (text) =>
          /^[VM] /.test(text) ||
          / m$/.test(text) ||
          /^(Katalog|Referenz)-Bodenpunkt$/.test(text)
      )
    ).toBe(true);
    view.strokes.length = 0;
    view.rerender({
      ...view.options,
      showOpticalCenters: false,
      showScreenCenters: true,
      centerY: 0.7,
    });
    view.render();
    await view.settle();
    expect(view.strokes.some((stroke) => stroke.color === "#61ff9a")).toBe(
      false
    );
    expect(view.intersectSurface).not.toHaveBeenCalled();
    const shifted = last("#ae94ff");
    expect((shifted[0][0] + shifted[1][0]) / 2).toBeCloseTo(point(0.5).x);
    expect((shifted[0][1] + shifted[1][1]) / 2).toBeCloseTo(point(0.5).y);
    view.strokes.length = 0;
    view.rerender({
      ...view.options,
      showOpticalCenters: true,
      showScreenCenters: false,
    });
    view.render();
    await view.settle();
    expect(view.strokes.some((stroke) => stroke.color === "#ae94ff")).toBe(
      false
    );
    expect(view.strokes.some((stroke) => stroke.color === "#61ff9a")).toBe(
      true
    );
    view.unmount();
  });
  it("ignores another photo's plane mapping and emits no capture-camera labels or dots", async () => {
    shared.enu.mockImplementation(() =>
      new Matrix4().makeTranslation(-0.2, -0.1, -20)
    );
    const view = setup({
      readPlaneMapping: () =>
        ({
          imageId: "other",
          viewportToImage: new Matrix3().makeScale(100, 100),
          viewport: { width: 400, height: 300 },
        } as never),
    });
    view.render();
    await view.settle();
    const optical = view.strokes
      .filter((stroke) => stroke.color === "#61ff9a")
      .at(-1)!;
    expect(optical.points).toEqual([
      [233, 135],
      [247, 135],
      [240, 128],
      [240, 142],
    ]);
    expect(view.context.arc).not.toHaveBeenCalled();
    expect(
      view.painted.every(
        (text) =>
          /^[VM] /.test(text) ||
          / m$/.test(text) ||
          /^(Katalog|Referenz)-Bodenpunkt$/.test(text)
      )
    ).toBe(true);
    view.unmount();
  });
  it.each([
    [300, 150, 0],
    [100, 150, 0],
    [250, 200, Math.PI / 4],
    [150, 100, Math.PI / 4],
    [200, 50, 0],
    [210, 50, Math.atan2(-100, 10) + Math.PI / 2],
    [190, 250, Math.atan2(100, -10) - Math.PI / 2],
  ])(
    "aligns compact labels readably for plane endpoint(%s,%s)",
    async (x, y, expectedAngle) => {
      const target = { longitude: 0.2001, latitude: 0.1, heightMeters: 1000 };
      const view = setup({
        readTarget: () => target,
        readPlaneMapping: () =>
          ({
            imageId: "photo",
            viewport: { width: 400, height: 300 },
            viewportToImage: new Matrix3().makeTranslation(
              0.5 - x / 400,
              y / 300 - 0.5
            ),
          } as never),
      });
      view.render();
      await view.settle();
      const meter = view.labels.find((label) => / m$/.test(label.text))!;
      const pixels = view.labels.find((label) => label.text.startsWith("V "))!;
      const meters = Math.hypot(
        target.longitude,
        target.latitude,
        target.heightMeters
      );
      expect(meter.text).toBe(
        `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(
          meters
        )} m`
      );
      expect(meter).toMatchObject({
        x: 0,
        y: -3,
        baseline: "bottom",
        font: "11px monospace",
      });
      expect(pixels).toMatchObject({
        x: 0,
        y: 3,
        baseline: "top",
        font: "11px monospace",
      });
      expect(pixels.text).toBe(
        `V ${Math.round(Math.hypot(x - 200, y - 150))} px`
      );
      expect(pixels.angle).toBeCloseTo(expectedAngle);
      expect(meter.angle).toBeCloseTo(expectedAngle);
      expect(Math.abs(pixels.angle)).toBeLessThanOrEqual(Math.PI / 3);
      expect(pixels.origin[0]).toBeCloseTo((200 + x) / 2);
      expect(pixels.origin[1]).toBeCloseTo((150 + y) / 2);
      const line = view.strokes
        .filter((stroke) => stroke.color === "#ffe45e")
        .at(-1)!;
      expect(line.points[0]).toEqual([200, 150]);
      expect(line.points[1][0]).toBeCloseTo(x);
      expect(line.points[1][1]).toBeCloseTo(y);
      view.unmount();
    }
  );

  it.each([null, { x: 150, y: 70 }])(
    "dots a non-covering or unprojectable target (%j) without outside text",
    async (pixel) => {
      shared.pixel.mockReturnValue(pixel);
      const view = setup({ readTarget: () => ground });
      view.render();
      await view.settle();
      const line = view.strokes
        .filter((stroke) => stroke.color === "#ffe45e")
        .at(-1)!;
      expect(line).toMatchObject({ width: 0.75, alpha: 0.3, dash: [1, 4] });
      expect(view.painted).toEqual([
        "Katalog-Bodenpunkt",
        "Referenz-Bodenpunkt",
      ]);
      expect(view.labels.map((label) => label.text)).toEqual([
        "Katalog-Bodenpunkt",
        "Referenz-Bodenpunkt",
      ]);
      expect(view.painted.join(" ")).not.toMatch(
        /außerhalb|outside|SOURCE|Bildmitte|Kamera/
      );
      expect(view.context.arc).not.toHaveBeenCalled();
      view.unmount();
    }
  );

  it("labels only the independent nearest View and Mouse while retaining all connection lines", async () => {
    const view = setup({
      readTarget: () => ground,
      readPointerTarget: () => ({
        longitude: 0.6,
        latitude: 0,
        heightMeters: 0,
      }),
    });
    const first = view.getRecord();
    view.setRecords([
      {
        ...first,
        catalogCenter: {
          ...first.catalogCenter!,
          longitude: 0.1,
          latitude: 0,
          ecefMeters: [0.1, 0, 0],
        },
      },
      {
        ...first,
        id: "second",
        sourceId: "SECOND",
        catalogCenter: {
          ...first.catalogCenter!,
          longitude: 0.6,
          latitude: 0,
          ecefMeters: [0.6, 0, 0],
        },
      },
    ]);
    view.resolvePhoto.mockImplementation(async (record) => ({
      ...view.photo,
      record,
      pose: {
        ...view.photo.pose,
        longitude: record.id === "photo" ? 0.1 : 0.6,
      },
    }));
    shared.enu.mockImplementation((_origin, _frame, pose) =>
      new Matrix4().makeTranslation(-pose.longitude, 0, -10)
    );
    view.intersectSurface
      .mockReturnValueOnce({ point: new Vector3(0.1, 0, 0) })
      .mockReturnValue({ point: new Vector3(0.6, 0, 0) });
    view.render();
    await view.settle();
    move(view.container, 330, 150);
    await advance(40);
    view.strokes.length = 0;
    view.render();
    const connections = view.strokes.filter(
      (stroke) =>
        stroke.points.length === 2 &&
        ["#ffe45e", "#59e8ff", "#ff8dc7"].includes(stroke.color)
    );
    const viewport = connections.filter((stroke) => stroke.color !== "#ff8dc7");
    const mouse = connections.filter((stroke) => stroke.color === "#ff8dc7");
    expect(viewport).toHaveLength(2);
    expect(mouse).toHaveLength(2);
    expect(
      viewport.map(({ width, alpha, dash }) => ({ width, alpha, dash }))
    ).toEqual([
      { width: 2.5, alpha: 0.85, dash: [] },
      { width: 0.75, alpha: 0.3, dash: [] },
    ]);
    expect(
      mouse.map(({ width, alpha, dash }) => ({ width, alpha, dash }))
    ).toEqual([
      { width: 0.75, alpha: 0.3, dash: [] },
      { width: 2.5, alpha: 0.85, dash: [] },
    ]);
    expect(view.painted.filter((text) => /^[VM] /.test(text))).toEqual([
      "V 20 px",
      "M 10 px",
    ]);
    expect(view.labels.filter(({ text }) => / m$/.test(text))).toHaveLength(2);
    expect(
      view.labels.filter(
        ({ text }) => !/^(Katalog|Referenz)-Bodenpunkt$/.test(text)
      )
    ).toHaveLength(4);
    expect(view.painted.join(" ")).not.toMatch(/#|120 px|110 px|–/);
    view.context.clearRect.mockClear();
    view.context.fillText.mockClear();
    view.render();
    expect(view.context.clearRect).not.toHaveBeenCalled();
    expect(view.context.fillText).not.toHaveBeenCalled();
    view.unmount();
  });
});

it("draws catalogue centres with unavailable depth and does not subscribe to terrain", async () => {
  const view = setup({
    intersectSurface: vi.fn(() => {
      throw new Error("Live depth forbidden");
    }),
  });
  view.render();
  await view.settle();
  expect(view.painted.some((text) => text.startsWith("V "))).toBe(true);
  expect(view.options.intersectSurface).not.toHaveBeenCalled();
  expect(shared.terrain).toBeNull();
  view.bumpSurface();
  view.render();
  await view.settle();
  expect(view.options.intersectSurface).not.toHaveBeenCalled();
  view.unmount();
});

describe("catalogue and pitched-reference ground markers", () => {
  const point = (longitude: number, latitude = 0.2) => ({
    target: {
      longitude,
      latitude,
      heightMeters: 0,
      heightDatum: "dhhn2016" as const,
      ecefMeters: [longitude, latitude, 0] as [number, number, number],
    },
    surface: "mesh" as const,
    imagePoint: { x: 0.5, y: 0.3 },
  });
  const marker = (view: ReturnType<typeof setup>, color: string) =>
    view.strokes
      .filter(
        (s) =>
          s.color === color && s.points.length === 4 && s.points[0][1] < 190
      )
      .at(-1)?.points;

  it("projects catalogue and resolved ground positions in the scene, independent of the selected flat photo mapping", async () => {
    const resolveReferencePoint = vi.fn().mockResolvedValue(point(-0.3));
    const view = setup({
      resolveReferencePoint,
      readPlaneMapping: () =>
        ({
          imageId: "photo",
          viewport: { width: 400, height: 300 },
          viewportToImage: new Matrix3().set(2, 0, 0, 0, 1, 0, 0, 0, 1),
        } as never),
    });
    view.render();
    expect(resolveReferencePoint).not.toHaveBeenCalled();
    await view.settle();
    expect(resolveReferencePoint).toHaveBeenCalledOnce();
    expect(resolveReferencePoint).toHaveBeenCalledWith(
      view.getRecord(),
      0.3,
      "auto"
    );
    expect(marker(view, "#3ddcff")).toEqual([
      [233, 135],
      [247, 135],
      [240, 128],
      [240, 142],
    ]);
    expect(marker(view, "#ffb347")).toEqual([
      [133, 120],
      [147, 120],
      [140, 113],
      [140, 127],
    ]);
    const sensor = marker(view, "#ae94ff")!;
    expect((sensor[0][0] + sensor[1][0]) / 2).toBeCloseTo(100);
    expect(view.painted).toEqual(
      expect.arrayContaining(["Katalog-Bodenpunkt", "Referenz-Bodenpunkt"])
    );
    expect(view.context.arc).not.toHaveBeenCalled();
    expect(view.intersectSurface).not.toHaveBeenCalled();
    const calls = resolveReferencePoint.mock.calls.length;
    view.render();
    view.render();
    await view.settle();
    expect(resolveReferencePoint).toHaveBeenCalledTimes(calls);
    view.unmount();
  });

  it("retains the previous reference while preparing, ignores stale slider results, and retries missing hits on surface revision", async () => {
    const stale = deferred<ReturnType<typeof point> | null>();
    let revision = "first";
    const resolveReferencePoint = vi
      .fn()
      .mockResolvedValueOnce(point(-0.3))
      .mockReturnValueOnce(stale.promise)
      .mockResolvedValueOnce(point(0.4))
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(point(0.1));
    const view = setup({
      resolveReferencePoint,
      readReferenceRevision: () => revision,
    });
    view.render();
    await view.settle();
    view.rerender({ ...view.options, centerY: 0.5 });
    view.render();
    await view.settle();
    expect(marker(view, "#ffb347")![0][0]).toBeCloseTo(133);
    view.rerender({ ...view.options, centerY: 0.7 });
    view.render();
    await act(async () => {
      stale.resolve(point(0.9));
      await Promise.resolve();
    });
    view.strokes.length = 0;
    await view.settle();
    expect(resolveReferencePoint).toHaveBeenLastCalledWith(
      view.getRecord(),
      0.7,
      "auto"
    );
    expect(marker(view, "#ffb347")![0][0]).toBeCloseTo(273);
    expect(
      view.strokes.some(
        (s) => s.color === "#ffb347" && s.points[0]?.[0] === 373
      )
    ).toBe(false);
    view.rerender({ ...view.options, centerY: 0.7, surfaceMode: "terrain" });
    view.render();
    await view.settle();
    view.strokes.length = 0;
    view.render(0.01);
    expect(marker(view, "#ffb347")).toBeUndefined();
    revision = "terrain-arrived";
    view.render();
    await view.settle();
    expect(resolveReferencePoint).toHaveBeenLastCalledWith(
      view.getRecord(),
      0.7,
      "terrain"
    );
    expect(marker(view, "#ffb347")).toBeDefined();
    expect(view.intersectSurface).not.toHaveBeenCalled();
    view.unmount();
  });

  it("ignores an asynchronous reference after unmount", async () => {
    const pending = deferred<ReturnType<typeof point> | null>();
    const view = setup({ resolveReferencePoint: vi.fn(() => pending.promise) });
    view.render();
    await view.settle();
    view.unmount();
    const paints = view.context.clearRect.mock.calls.length;
    await act(async () => {
      pending.resolve(point(0.8));
      await Promise.resolve();
    });
    await vi.runOnlyPendingTimersAsync();
    expect(view.context.clearRect).toHaveBeenCalledTimes(paints);
    expect(shared.release).toHaveBeenCalledOnce();
  });
});

it("connects and ranks view/mouse distances by resolved physical reference points rather than catalogue or sensor centres", async () => {
  const resolveReferencePoint = vi.fn(async (record: ObliqueImageRecord) => ({
    target: {
      longitude: record.id === "photo" ? 0.6 : 0.1,
      latitude: 0,
      heightMeters: 0,
      heightDatum: "dhhn2016" as const,
      ecefMeters: [record.id === "photo" ? 30 : 2, 0, 0] as [
        number,
        number,
        number
      ],
    },
    surface: "mesh" as const,
    imagePoint: { x: 0.5, y: 0.3 },
  }));
  const view = setup({
    resolveReferencePoint,
    readTarget: () => ({ longitude: 0, latitude: 0, heightMeters: 0 }),
    readPointerTarget: () => ({ longitude: 31, latitude: 0, heightMeters: 0 }),
    readPlaneMapping: () =>
      ({
        imageId: "photo",
        viewport: { width: 400, height: 300 },
        viewportToImage: new Matrix3(),
      } as never),
  });
  const first = view.getRecord();
  view.setRecords([
    {
      ...first,
      catalogCenter: { ...first.catalogCenter!, ecefMeters: [0.01, 0, 0] },
    },
    {
      ...first,
      id: "second",
      catalogCenter: { ...first.catalogCenter!, ecefMeters: [999, 0, 0] },
    },
  ]);
  view.render();
  await view.settle();
  act(() => {
    view.container.dispatchEvent(
      new MouseEvent("pointermove", { clientX: 330, clientY: 180 })
    );
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(40);
  });
  view.strokes.length = 0;
  view.render();
  const lines = view.strokes.filter(
    (s) =>
      s.points.length === 2 &&
      ["#ffe45e", "#59e8ff", "#ff8dc7"].includes(s.color)
  );
  expect(
    lines
      .filter((s) => s.color !== "#ff8dc7")
      .map((s) => ({ end: s.points[1], width: s.width }))
  ).toEqual([
    { end: [320, 150], width: 0.75 },
    { end: [220.00000000000003, 150], width: 2.5 },
  ]);
  expect(
    lines.filter((s) => s.color === "#ff8dc7").map((s) => s.width)
  ).toEqual([2.5, 0.75]);
  expect(view.painted.filter((text) => / m$/.test(text))).toEqual([
    "1 m",
    "2 m",
  ]);
  expect(view.painted.filter((text) => /^[VM] /.test(text))).toEqual([
    "M 10 px",
    "V 20 px",
  ]);
  expect(view.intersectSurface).not.toHaveBeenCalled();
  view.unmount();
});

it("draws the catalogue cross but no substitute connection when a configured reference resolver returns null", async () => {
  const view = setup({
    resolveReferencePoint: vi.fn().mockResolvedValue(null),
  });
  view.render();
  await view.settle();
  expect(
    view.strokes.some((s) => s.color === "#3ddcff" && s.points[0]?.[0] === 233)
  ).toBe(true);
  expect(
    view.strokes.filter(
      (s) =>
        s.points.length === 2 &&
        ["#ffe45e", "#59e8ff", "#ff8dc7"].includes(s.color)
    )
  ).toEqual([]);
  expect(view.painted.filter((text) => /^[VM] | m$/.test(text))).toEqual([]);
  expect(view.intersectSurface).not.toHaveBeenCalled();
  view.unmount();
});
