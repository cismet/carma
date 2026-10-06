import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LayerSpecification, Map as MaplibreMap } from "maplibre-gl";
import type { FeatureCollection, Position } from "geojson";
import type {
  ObliqueDataset,
  ObliqueImageRecord,
  ObliquePose,
} from "../core/types";
import { Matrix4, Vector3 } from "three";
import { createFootprintOutlineLayer } from "./footprint-outline-layer";

vi.mock("maplibre-gl", async () => {
  const { MercatorCoordinate } = await import(
    "maplibre-gl/src/geo/mercator_coordinate"
  );
  return { MercatorCoordinate };
});
const scene = vi.hoisted(() => ({
  runtimes: [] as object[],
  release: vi.fn(),
  projective: vi.fn(),
  removeBefore: vi.fn(),
  beforeRender: undefined as ((frame: unknown) => void) | undefined,
  localFrame: undefined as
    | { revision: number; sceneFromLocal: Matrix4; lngLat: [number, number] }
    | undefined,
}));
vi.mock("@carma-mapping/engines/maplibre", () => ({
  getSharedThreeSceneRuntimes: () => scene.runtimes,
  acquireSharedThreeScene: () => ({
    layer: {
      id: "shared",
      setMapStyleProjectiveOverlay: scene.projective,
      getLocalFrame: () => scene.localFrame,
      projectSceneToLngLat: () => [0, 0],
      projectLngLatToScene: ([lng, lat]: [number, number], height: number) =>
        new Vector3(lng, height, -lat),
      addBeforeRenderCallback: (callback: (frame: unknown) => void) => {
        scene.beforeRender = callback;
        return scene.removeBefore;
      },
    },
    release: scene.release,
  }),
}));
const ring: Position[] = [
  [0, 0],
  [0.002, 0],
  [0.002, -0.002],
  [0, -0.002],
  [0, 0],
];
const pose = { direction: [0, 0, -1], up: [0, 1, 0] } as ObliquePose;
const drawSurfaceLabel = vi.fn();
const readLabelPixels = vi.fn();
const cleanupHandles: Array<ReturnType<typeof createFootprintOutlineLayer>> =
  [];
const setup = (mesh = false) => {
  scene.runtimes = mesh
    ? [{ id: "mesh", receivesMapStyleTexture: true, mountsOnLocalFrame: true }]
    : [];
  scene.localFrame = {
    revision: 1,
    sceneFromLocal: new Matrix4(),
    lngLat: [0, 0],
  };
  const layers = new Map<string, LayerSpecification>();
  const images = new Map<string, ImageData>();
  const sources = new Map<
    string,
    { data: FeatureCollection; setData: (next: FeatureCollection) => void }
  >();
  const listeners = new Map<string, Set<() => void>>();
  let order = mesh ? ["shared"] : [];
  const fire = (event: string) =>
    listeners.get(event)?.forEach((listener) => listener());
  const map = {
    getSource: (id: string) => sources.get(id),
    addSource: vi.fn((id: string, source: { data: FeatureCollection }) => {
      const value = {
        data: source.data,
        setData: vi.fn((next: FeatureCollection) => {
          value.data = next;
        }),
      };
      sources.set(id, value);
    }),
    removeSource: vi.fn((id: string) => sources.delete(id)),
    getLayer: (id: string) => layers.get(id),
    addLayer: vi.fn((layer: LayerSpecification) => {
      layers.set(layer.id, layer);
      order.push(layer.id);
      fire("styledata");
    }),
    removeLayer: vi.fn((id: string) => {
      layers.delete(id);
      order = order.filter((value) => value !== id);
    }),
    getLayersOrder: () => order,
    moveLayer: vi.fn((id: string, before: string) => {
      order = order.filter((value) => value !== id);
      order.splice(order.indexOf(before), 0, id);
      fire("styledata");
    }),
    setPaintProperty: vi.fn(),
    setLayoutProperty: vi.fn(),
    queryTerrainElevation: vi.fn(),
    triggerRepaint: vi.fn(),
    setFeatureState: vi.fn(),
    removeFeatureState: vi.fn(),
    getZoom: vi.fn(() => 17),
    isMoving: vi.fn(() => false),
    unproject: vi.fn(() => ({ lng: 0.001, lat: -0.001 })),
    queryRenderedFeatures: vi.fn(
      (): Array<{ id?: string; properties?: Record<string, unknown> }> => [
        { id: "footprint", properties: { revision: 1 } },
      ]
    ),
    hasImage: (id: string) => images.has(id),
    addImage: vi.fn((id: string, image: ImageData) => images.set(id, image)),
    updateImage: vi.fn((id: string, image: ImageData) => images.set(id, image)),
    removeImage: vi.fn((id: string) => images.delete(id)),
    on: (event: string, listener: () => void) => {
      const handlers = listeners.get(event) ?? new Set();
      handlers.add(listener);
      listeners.set(event, handlers);
    },
    off: (event: string, listener: () => void) =>
      listeners.get(event)?.delete(listener),
  };
  const handle = createFootprintOutlineLayer(
    map as unknown as MaplibreMap,
    "footprint",
    { color: "white", width: 5, opacity: 1 }
  );
  cleanupHandles.push(handle);
  return { handle, map, layers, sources, images, fire };
};
afterEach(() => {
  cleanupHandles.splice(0).forEach((handle) => handle.destroy());
  vi.useRealTimers();
  vi.restoreAllMocks();
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    measureText: () => ({ width: 400 }),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    save: vi.fn(),
    clip: vi.fn(),
    clearRect: vi.fn(),
    restore: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    setTransform: vi.fn(),
    drawImage: drawSurfaceLabel,
    fillText: vi.fn(),
    getImageData: readLabelPixels,
  } as unknown as CanvasRenderingContext2D);
});

const physicalPose: ObliquePose = {
  ...pose,
  longitude: 0,
  latitude: 0,
  z: 100,
  bearingDeg: 0,
  pitchDeg: 0,
  rollDeg: 0,
  utmConvergenceRad: 0,
};
const dataset = {
  id: "series",
  heightDatum: "dhhn2016",
  cameras: {
    camera: {
      widthPx: 2000,
      heightPx: 1000,
      focalLengthMm: 100,
      principalPointPx: [1000, 500],
      halfFovTan: 0.5,
      upMapping: { rowIndex: 1, negate: false },
    },
  },
} as unknown as ObliqueDataset;
const annotation = (id: string) => ({
  pose: physicalPose,
  imageId: id,
  hoverLabel: "2024",
  record: {
    id,
    sourceId: id,
    seriesId: "series",
    cameraId: "camera",
    x: 0,
    y: 0,
    z: 100,
    m: [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ],
    centerWGS84: [0, 0, 100],
    pose: physicalPose,
  } as unknown as ObliqueImageRecord,
  dataset,
});
const candidate = (id: string) => {
  const input = annotation(id);
  return {
    id,
    ring,
    pose: input.pose,
    seriesLabel: "2024",
    record: input.record,
    dataset,
  };
};

describe("calibrated current highlights and bounded selection trails", () => {
  it("waits for a shared receiver without creating approximate native footprints", () => {
    const { handle, map, fire, sources, layers } = setup();
    handle.setRing(ring, annotation("center"));
    handle.setHoveredImage("pointer", candidate("pointer"));
    expect(scene.projective).not.toHaveBeenCalled();
    expect(sources.size).toBe(0);
    expect(layers.size).toBe(0);
    expect(handle.containsScreenPoint({ x: 20, y: 20 })).toBe(false);
    expect(handle.imageAtScreenPoint({ x: 20, y: 20 })).toBeNull();
    expect(map.queryRenderedFeatures).not.toHaveBeenCalled();
    scene.runtimes = [{ receivesMapStyleTexture: true }];
    fire("idle");
    expect(scene.projective.mock.calls.at(-1)?.[1].marks).toHaveLength(2);
    expect(map.addSource).not.toHaveBeenCalled();
    expect(map.addLayer).not.toHaveBeenCalled();
  });
  it("removes only retained legacy layers after the render stack and never recreates them", () => {
    vi.useFakeTimers();
    const { handle, map, fire, sources, layers, images } = setup(true);
    for (const id of [
      "footprint",
      "footprint-interior",
      "footprint-caret",
      "footprint-label",
    ])
      layers.set(id, { id, type: "fill", source: "footprint-source" });
    sources.set("footprint-source", {
      data: { type: "FeatureCollection", features: [] },
      setData: vi.fn(),
    });
    images.set("footprint-label-image", {} as ImageData);
    images.set("footprint-hover-label-image", {} as ImageData);
    handle.setRing(ring, annotation("center"));
    scene.beforeRender?.({ localFrame: scene.localFrame });
    expect(map.removeLayer).not.toHaveBeenCalled();
    vi.advanceTimersByTime(0);
    expect(layers.size).toBe(0);
    expect(sources.size).toBe(0);
    expect(images.size).toBe(0);
    expect(map.removeLayer).toHaveBeenCalledTimes(4);
    fire("styledata");
    fire("idle");
    expect(map.addSource).not.toHaveBeenCalled();
    expect(map.addLayer).not.toHaveBeenCalled();
    expect(map.addImage).not.toHaveBeenCalled();
  });
  it("highlights only the pointer, with center as the no-pointer fallback", () => {
    const { handle, map, sources, layers } = setup(true);
    const nearby = Array.from({ length: 128 }, (_, i) =>
      candidate("candidate-" + i)
    );
    handle.setRing(ring, annotation("center"), nearby);
    let overlay = scene.projective.mock.calls.at(-1)?.[1];
    expect(overlay.marks).toHaveLength(1);
    expect(overlay.marks[0].color.getHexString()).toBe("ffffff");
    expect(overlay.marks[0].labelRect).toEqual([0, 0, 1, 1]);
    handle.setHoveredImage("pointer", candidate("pointer"));
    overlay = scene.projective.mock.calls.at(-1)?.[1];
    expect(overlay.marks).toHaveLength(2);
    expect(
      overlay.marks.map((mark: { fillOpacity: number }) => mark.fillOpacity)
    ).toEqual([0, 0.08]);
    expect(overlay.marks[0].color.getHexString()).toBe("ffffff");
    expect(overlay.marks[1].color.getHexString()).toBe("ffffff");
    handle.setHoveredImage(null);
    overlay = scene.projective.mock.calls.at(-1)?.[1];
    const center = overlay.marks.at(-1);
    expect(center.color.getHexString()).toBe("ffffff");
    expect(center.labelRect).toEqual([0, 0, 1, 1]);
    expect(map.setPaintProperty).not.toHaveBeenCalled();
    expect(map.addSource).not.toHaveBeenCalled();
    expect(map.addLayer).not.toHaveBeenCalled();
    expect(sources.size).toBe(0);
    expect(layers.size).toBe(0);
    expect(readLabelPixels).not.toHaveBeenCalled();
  });
  it("hides centre and cached pointer labels as the loaded series count changes", () => {
    const { handle } = setup(true);
    handle.setRing(ring, { ...annotation("center"), seriesLabel: "2024" });
    handle.setHoveredImage("pointer", candidate("pointer"));
    const initial = scene.projective.mock.calls.at(-1)?.[1];
    expect(
      initial.marks
        .filter(
          (mark: { trailStartedAt?: number }) =>
            mark.trailStartedAt === undefined
        )
        .every((mark: { labelRect?: unknown }) => mark.labelRect)
    ).toBe(true);
    const dispose = vi.spyOn(initial.labelAtlas, "dispose");
    handle.setLabelsVisible(false);
    let overlay = scene.projective.mock.calls.at(-1)?.[1];
    expect(overlay.marks).toHaveLength(2);
    expect(
      overlay.marks.every((mark: { labelRect?: unknown }) => !mark.labelRect)
    ).toBe(true);
    expect(
      overlay.marks.every(
        (mark: { showUpMarker: boolean }) => mark.showUpMarker
      )
    ).toBe(true);
    expect(overlay.labelAtlas).toBeUndefined();
    expect(dispose).toHaveBeenCalledOnce();
    const uploads = scene.projective.mock.calls.length;
    handle.setLabelsVisible(false);
    expect(scene.projective).toHaveBeenCalledTimes(uploads);
    handle.setLabelsVisible(true);
    overlay = scene.projective.mock.calls.at(-1)?.[1];
    expect(
      overlay.marks
        .filter(
          (mark: { trailStartedAt?: number }) =>
            mark.trailStartedAt === undefined
        )
        .every((mark: { labelRect?: unknown }) => mark.labelRect)
    ).toBe(true);
    expect(overlay.marks[0].sceneToImage).toBe(initial.marks[0].sceneToImage);
    expect(overlay.marks[1].sceneToImage).toBe(initial.marks[1].sceneToImage);
  });
  it("does not highlight the center for a pointer miss or while waiting for a hit", () => {
    const { handle } = setup(true);
    const highlights = () =>
      (scene.projective.mock.calls.at(-1)?.[1]?.marks ?? []).filter(
        (mark: { trailStartedAt?: number }) => mark.trailStartedAt === undefined
      );
    handle.setRing(ring, annotation("center"));
    expect(highlights()).toHaveLength(1);
    handle.setHoveredImage(null, undefined, true);
    expect(highlights()).toHaveLength(0);
    handle.setHoveredImage("pointer", candidate("pointer"));
    expect(highlights()).toHaveLength(1);
    handle.setRing(ring, annotation("other-center"));
    expect(highlights()).toHaveLength(1);
    expect(highlights()[0].labelRect).toBeDefined();
    handle.setHoveredImage(null, undefined, true);
    expect(highlights()).toHaveLength(0);
    handle.setHoveredImage(null);
    expect(highlights()).toHaveLength(1);
  });
  it("retains at most 32 preceding center or pointer outlines, with no fill and unchanged width", () => {
    const { handle } = setup(true);
    handle.setRing(ring, annotation("center"));
    for (let i = 0; i < 40; i++)
      handle.setHoveredImage("pointer-" + i, candidate("pointer-" + i));
    const overlay = scene.projective.mock.calls.at(-1)?.[1];
    const trails = overlay.marks.filter(
      (mark: { trailStartedAt?: number }) => mark.trailStartedAt !== undefined
    );
    expect(trails).toHaveLength(32);
    expect(
      trails.every((mark: { fillOpacity: number }) => mark.fillOpacity === 0)
    ).toBe(true);
    expect(overlay.marks).toHaveLength(33);
    expect(
      overlay.marks.every((mark: { width: number }) => mark.width === 5)
    ).toBe(true);
    expect(
      trails.every((mark: { opacity: number }) => mark.opacity === 0.2)
    ).toBe(true);
  });
  it("skips viewport unprojection and timers while there are no historical trails", () => {
    vi.useFakeTimers();
    const { handle, map, fire } = setup(true);
    Object.assign(map, { transform: { width: 100, height: 100 } });
    handle.setRing(ring, annotation("center"));
    vi.advanceTimersByTime(0);
    for (let index = 0; index < 32; index++) {
      fire("move");
      fire("resize");
      fire("idle");
      scene.beforeRender?.({ localFrame: scene.localFrame });
    }
    expect(map.unproject).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    expect(scene.projective.mock.lastCall?.[1].marks).toHaveLength(1);
  });

  it("reuses trail viewport bounds until move or resize and prunes with the refreshed bounds", () => {
    vi.useFakeTimers();
    vi.spyOn(performance, "now").mockImplementation(() => Date.now());
    const { handle, map, fire } = setup(true);
    Object.assign(map, { transform: { width: 100, height: 100 } });
    handle.setRing(ring, annotation("first"));
    handle.setRing(ring, annotation("second"));
    expect(map.unproject).toHaveBeenCalledTimes(4);
    expect(scene.projective.mock.lastCall?.[1].marks).toHaveLength(2);
    for (let index = 0; index < 16; index++) {
      fire("idle");
      scene.beforeRender?.({ localFrame: scene.localFrame });
    }
    expect(map.unproject).toHaveBeenCalledTimes(4);
    map.unproject.mockReturnValue({ lng: 10, lat: 10 });
    fire("move");
    fire("idle");
    expect(map.unproject).toHaveBeenCalledTimes(8);
    expect(scene.projective.mock.lastCall?.[1].marks).toHaveLength(1);
    map.unproject.mockReturnValue({ lng: 0.001, lat: -0.001 });
    fire("resize");
    handle.setRing(ring, annotation("third"));
    expect(map.unproject).toHaveBeenCalledTimes(12);
    expect(scene.projective.mock.lastCall?.[1].marks).toHaveLength(2);
    fire("idle");
    expect(map.unproject).toHaveBeenCalledTimes(12);
  });

  it("repaints GPU trail fades at ten Hz without rebuilding marks or label pixels", () => {
    vi.useFakeTimers();
    vi.spyOn(performance, "now").mockImplementation(() => Date.now());
    const { handle, map } = setup(true);
    handle.setRing(ring, annotation("first"));
    handle.setRing(ring, annotation("second"));
    const uploads = scene.projective.mock.calls.length,
      repaints = map.triggerRepaint.mock.calls.length,
      labelDraws = drawSurfaceLabel.mock.calls.length;
    vi.advanceTimersByTime(1333);
    expect(scene.projective).toHaveBeenCalledTimes(uploads);
    expect(drawSurfaceLabel).toHaveBeenCalledTimes(labelDraws);
    expect(map.triggerRepaint).toHaveBeenCalledTimes(repaints + 13);
    expect(map.setFeatureState).not.toHaveBeenCalled();
    expect(readLabelPixels).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1334);
    expect(scene.projective.mock.calls.at(-1)?.[1].marks).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("fades every contour before preview and stops all hidden repaint work", async () => {
    vi.useFakeTimers();
    vi.spyOn(performance, "now").mockImplementation(() => Date.now());
    const { handle, map } = setup(true);
    handle.setRing(ring, annotation("first"));
    handle.setRing(ring, annotation("second"));
    handle.setHoveredImage("pointer", candidate("pointer"));
    let hidden = false;
    const done = handle.setLocked(true, { duration: 8000 }).then(() => {
      hidden = true;
    });
    const preview = scene.projective.mock.calls.at(-1)?.[1];
    expect(preview.marks).toHaveLength(3);
    expect(preview.opacity).toBe(1);
    vi.advanceTimersByTime(50);
    scene.beforeRender?.({ localFrame: scene.localFrame });
    expect(scene.projective.mock.calls.at(-1)?.[1].opacity).toBe(0.5);
    expect(scene.projective.mock.calls.at(-1)?.[1].marks).toBe(preview.marks);
    expect(hidden).toBe(false);
    vi.advanceTimersByTime(50);
    await done;
    expect(hidden).toBe(true);
    expect(scene.projective.mock.calls.at(-1)?.[1]).toBeNull();
    const repaints = map.triggerRepaint.mock.calls.length;
    vi.advanceTimersByTime(8000);
    scene.beforeRender?.({ localFrame: scene.localFrame });
    expect(map.triggerRepaint).toHaveBeenCalledTimes(repaints);
    expect(vi.getTimerCount()).toBe(0);
    handle.setLocked(false);
    expect(scene.projective.mock.calls.at(-1)?.[1].marks).toHaveLength(1);
    expect(scene.projective.mock.calls.at(-1)?.[1].marks[0].fillOpacity).toBe(
      0.08
    );
  });
  it("publishes immediate calibrated highlights after trails without native feature-state layers", () => {
    const { handle, map } = setup(true);
    handle.setRing(ring, annotation("first"));
    handle.setRing(ring, annotation("center"));
    handle.setHoveredImage("pointer", candidate("pointer"));
    const overlay = scene.projective.mock.calls.at(-1)?.[1];
    expect(overlay.marks).toHaveLength(3);
    expect(
      overlay.marks.map(
        (mark: { trailStartedAt?: number }) => mark.trailStartedAt !== undefined
      )
    ).toEqual([true, true, false]);
    expect(
      overlay.marks.map((mark: { fillOpacity: number }) => mark.fillOpacity)
    ).toEqual([0, 0, 0.08]);
    expect(
      overlay.marks.every(
        (mark: { sceneToImage: Matrix4; sceneToImageTerrain: Matrix4 }) =>
          mark.sceneToImage.isMatrix4 && mark.sceneToImageTerrain.isMatrix4
      )
    ).toBe(true);
    expect(overlay.labelAtlas.image.width).toBe(512);
    expect(overlay.trailDuration).toBeCloseTo(8 / 3);
    expect(map.addSource).not.toHaveBeenCalled();
    expect(map.addLayer).not.toHaveBeenCalled();
    expect(map.setLayoutProperty).not.toHaveBeenCalled();
    expect(map.addImage).not.toHaveBeenCalled();
  });
  it("refreshes matrices only for local-frame changes and reuses the small label atlas", () => {
    const { handle } = setup(true);
    handle.setRing(ring, annotation("center"));
    const overlay = scene.projective.mock.calls.at(-1)?.[1],
      calls = scene.projective.mock.calls.length;
    const frame = { localFrame: scene.localFrame };
    scene.beforeRender?.(frame);
    scene.beforeRender?.(frame);
    expect(scene.projective).toHaveBeenCalledTimes(calls);
    const next = {
      ...scene.localFrame!,
      revision: 2,
      sceneFromLocal: new Matrix4().makeTranslation(10, 0, 0),
    };
    scene.beforeRender?.({ localFrame: next });
    expect(scene.projective.mock.calls.at(-1)?.[1].labelAtlas).toBe(
      overlay.labelAtlas
    );
    expect(
      scene.projective.mock.calls
        .at(-1)?.[1]
        .marks[0].sceneToImage.equals(overlay.marks[0].sceneToImage)
    ).toBe(false);
  });
  it("does not revive hidden contours on style or tile changes and restores browsing highlights", async () => {
    vi.useFakeTimers();
    vi.spyOn(performance, "now").mockImplementation(() => Date.now());
    const { handle } = setup(true);
    handle.setRing(ring, annotation("center"));
    handle.setHoveredImage("pointer", candidate("pointer"));
    const done = handle.setLocked(true);
    vi.advanceTimersByTime(100);
    await done;
    handle.setStyle({
      color: "#00ffff",
      width: 3,
      opacity: 0.5,
      fillOpacity: 1,
    });
    scene.beforeRender?.({ localFrame: { ...scene.localFrame!, revision: 2 } });
    expect(scene.projective.mock.calls.at(-1)?.[1]).toBeNull();
    handle.setLocked(false);
    const overlay = scene.projective.mock.calls.at(-1)?.[1];
    expect(overlay.marks[0].width).toBe(3);
    expect(overlay.marks[0].showUpMarker).toBe(true);
    expect(overlay.marks[0].fillOpacity).toBe(0.08);
    expect(overlay.opacity * overlay.marks[0].fillOpacity).toBe(0.04);
  });
  it("resolves a cancelled fade on unlock or destroy without leaving timers", async () => {
    vi.useFakeTimers();
    vi.spyOn(performance, "now").mockImplementation(() => Date.now());
    const { handle } = setup(true);
    handle.setRing(ring, annotation("center"));
    const cancelled = handle.setLocked(true);
    vi.advanceTimersByTime(25);
    handle.setLocked(false);
    await cancelled;
    expect(scene.projective.mock.calls.at(-1)?.[1].opacity).toBe(1);
    const destroyed = handle.setLocked(true);
    handle.destroy();
    await destroyed;
    expect(vi.getTimerCount()).toBe(0);
  });
  it("removes expired or out-of-viewport trails and releases callbacks, textures and timers", () => {
    vi.useFakeTimers();
    vi.spyOn(performance, "now").mockImplementation(() => Date.now());
    const { handle, map, fire } = setup(true);
    handle.setRing(ring, annotation("first"));
    handle.setRing(ring, annotation("second"));
    Object.assign(map, { transform: { width: 100, height: 100 } });
    map.unproject.mockReturnValue({ lng: 10, lat: 10 });
    fire("resize");
    fire("idle");
    expect(scene.projective.mock.calls.at(-1)?.[1].marks).toHaveLength(1);
    const atlas = scene.projective.mock.calls.at(-1)?.[1].labelAtlas,
      dispose = vi.spyOn(atlas, "dispose");
    handle.destroy();
    expect(dispose).toHaveBeenCalledOnce();
    expect(scene.removeBefore).toHaveBeenCalledOnce();
    expect(scene.release).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
