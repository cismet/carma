import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Camera, Matrix4, Texture, Vector2, Vector3 } from "three";
import { usePhotoMosaic } from "./usePhotoMosaic";

const mocks = vi.hoisted(() => ({
  callback: undefined as undefined | ((frame: never) => void),
  releaseScene: vi.fn(),
  setMosaic: vi.fn(),
  acquire: vi.fn(),
  acquireForeground: vi.fn(),
  networkActive: new Set<symbol>(),
  networkReleases: [] as ReturnType<typeof vi.fn>[],
  plan: vi.fn(),
  draw: vi.fn(),
  coarseUpdate: vi.fn(),
  coarseDispose: vi.fn(),
  retentionUpdate: vi.fn(),
  retentionRelease: vi.fn(),
  coarseReadBase: vi.fn(),
  peek: vi.fn(),
  poolSubscribe: vi.fn(),
  poolUnsubscribe: vi.fn(),
  poolChanged: undefined as undefined | (() => void),
  state: {} as Record<string, unknown>,
}));
vi.mock("@carma-mapping/engines/maplibre", () => ({
  acquireSharedThreeScene: () => ({
    release: mocks.releaseScene,
    layer: {
      getLocalFrame: () => ({ sceneFromLocal: new Matrix4() }),
      projectSceneToLngLat: () => [7, 51],
      setMapStylePhotoMosaic: mocks.setMosaic,
      getMapStyleProjectionState: () => ({ photoMosaic: mocks.state }),
      addBeforeRenderCallback: (callback: typeof mocks.callback) => {
        mocks.callback = callback;
        return () => {
          mocks.callback = undefined;
        };
      },
    },
  }),
  acquireForegroundNetwork: (...args: unknown[]) =>
    mocks.acquireForeground(...args),
  getSharedThreeSceneRuntimes: () => [],
  subscribeSharedThreeTerrain: () => () => {},
}));
vi.mock("@carma-commons/image-pyramid", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@carma-commons/image-pyramid")>()),
  drawImageLevels: (...args: unknown[]) => mocks.draw(...args),
}));
vi.mock("../../core/utils/image-projection", () => ({
  imageProjectionMatrix: () => new Matrix4(),
  sceneToPhotoEnu: () => new Matrix4(),
}));
vi.mock("../../core/utils/photo-mosaic-plan", () => ({
  planPhotoMosaic: (...args: unknown[]) => mocks.plan(...args),
}));
vi.mock("../utils/native-preview-pool", () => ({
  nativePreviewSource: (value: unknown) => value,
  nativePixelPool: {
    acquire: (...args: unknown[]) => mocks.acquire(...args),
    peek: (...args: unknown[]) => mocks.peek(...args),
    subscribe: mocks.poolSubscribe,
    retainWorkingSet: () => ({
      update: mocks.retentionUpdate,
      release: mocks.retentionRelease,
    }),
  },
}));
vi.mock("../utils/hover-candidate-prefetch", () => ({
  createHoverCandidatePrefetch: () => ({
    update: mocks.coarseUpdate,
    dispose: mocks.coarseDispose,
    readBase: (...args: unknown[]) => mocks.coarseReadBase(...args),
  }),
}));
vi.mock("../utils/oblique-viewport-source", () => ({
  originalOf: () => "original",
  pyramidOf: () => "pyramid",
}));
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const lease = (ready = Promise.resolve()) => ({
  release: vi.fn(),
  stack: {
    ready,
    configure: vi.fn(),
    setView: vi.fn(),
    subscribe: vi.fn((_callback: () => void) => () => {}),
    metrics: { visibleReady: true },
  },
});
const setup = (count = 4) => {
  const records = Array.from({ length: count }, (_, i) => ({
    id: String(i),
    sourceId: String(i),
  }));
  mocks.plan.mockImplementation(({ photos }: { photos: { id: string }[] }) =>
    photos.map((photo, i) => ({
      id: photo.id,
      view: { visible: { x: 10, y: 10, width: 10, height: 10 }, density: 1 },
      patches: [
        { x: 10, y: 10, width: 10, height: 10, density: 1, requiredDensity: 1 },
      ],
      priority: count - i,
      coverage: [31],
      nativeLimited: false,
      requiredDensity: 1,
    }))
  );
  const options = {
    enabled: true,
    groupKey: "2026:N",
    map: { triggerRepaint: vi.fn(), on: vi.fn(), off: vi.fn() },
    centerY: 0.3,
    readRecords: () => records,
    resolvePhoto: vi.fn(async (record: (typeof records)[number]) => ({
      record,
      dataset: { previewPath: "preview" },
      calibration: { widthPx: 64, heightPx: 64 },
      pose: {},
      altitude: 250,
    })),
    intersectSurface: vi.fn(
      (cast: { ray: { origin: Vector3; direction: Vector3 } }) => ({
        point: cast.ray.origin.clone().addScaledVector(cast.ray.direction, 1),
        surface: "terrain",
      })
    ),
  };
  const camera = new Camera();
  const frame = { renderCamera: camera, viewport: new Vector2(900, 700) };
  const fire = () => act(() => mocks.callback?.(frame as never));
  return { options, frame, camera, fire };
};
const settle = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(400);
  });
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mocks.state = {};
  mocks.networkActive.clear();
  mocks.networkReleases = [];
  mocks.acquireForeground.mockImplementation(() => {
    const token = Symbol();
    mocks.networkActive.add(token);
    const release = vi.fn(() => mocks.networkActive.delete(token));
    mocks.networkReleases.push(release);
    return release;
  });
  mocks.poolChanged = undefined;
  mocks.poolSubscribe.mockImplementation((callback: () => void) => {
    mocks.poolChanged = callback;
    return mocks.poolUnsubscribe;
  });
  mocks.peek.mockReturnValue(undefined);
  mocks.coarseReadBase.mockResolvedValue(undefined);
  mocks.acquire.mockImplementation(() => lease());
  vi.stubGlobal(
    "OffscreenCanvas",
    class {
      constructor(public width: number, public height: number) {}
      getContext() {
        return { drawImage: vi.fn() };
      }
    }
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("photo mosaic preparation lifecycle", () => {
  it("loads central cells first at higher density without changing photo ownership or draw order", async () => {
    const f = setup(2);
    const requested: { id: string; lease: ReturnType<typeof lease> }[] = [];
    let swap = false;
    mocks.plan.mockReturnValue(undefined);
    mocks.plan.mockImplementation(() =>
      [0, 1].map((i) => ({
        id: String(i),
        priority: 4 - i,
        coverage: [swap ? (i === 0 ? 31 : 0) : i === 0 ? 0 : 31],
        patches: [
          {
            x: i * 20 + 5,
            y: 5,
            width: 10,
            height: 10,
            density: 1,
            requiredDensity: 1,
          },
        ],
        view: {
          visible: { x: i * 20 + 5, y: 5, width: 10, height: 10 },
          density: 1,
        },
        requiredDensity: 1,
        nativeLimited: false,
      }))
    );
    mocks.acquire.mockImplementation((source) => {
      expect(mocks.networkActive.size).toBe(1);
      const request = lease();
      requested.push({ id: source.imageId, lease: request });
      return request;
    });
    const hook = renderHook(() => usePhotoMosaic(f.options as never));
    f.fire();
    await settle();
    expect(requested.map(({ id }) => id)).toEqual(["1", "0"]);
    expect(
      requested.map(({ lease }) => lease.stack.setView.mock.calls[0][0].density)
    ).toEqual([1, 0.5]);
    expect(
      mocks.setMosaic.mock.calls
        .at(-1)![1]
        .map((entry: { priority: number }) => entry.priority)
        .sort((a: number, b: number) => b - a)
    ).toEqual([9.25, 7.5]);
    expect(mocks.acquireForeground).toHaveBeenCalledWith(
      f.options.map,
      "oblique-mosaic-pixels",
      { refinementOnly: true }
    );
    expect(mocks.networkActive.size).toBe(0);
    mocks.networkReleases.forEach((release) =>
      expect(release).toHaveBeenCalledOnce()
    );
    // The same photo cell moves into focus after a camera change. Its old
    // peripheral snapshot cannot suppress the new native-detail request.
    swap = true;
    f.camera.projectionMatrix.elements[12] = 0.1;
    f.fire();
    await settle();
    expect(requested.slice(2).map(({ id }) => id)).toEqual(["0", "1"]);
    expect(
      requested
        .slice(2)
        .map(({ lease }) => lease.stack.setView.mock.calls[0][0].density)
    ).toEqual([1, 0.5]);
    expect(
      mocks.setMosaic.mock.calls
        .at(-1)![1]
        .map((entry: { priority: number }) => entry.priority)
        .sort((a: number, b: number) => b - a)
    ).toEqual([9.5, 7.25]);
    hook.unmount();
    expect(mocks.networkActive.size).toBe(0);
  });

  it("relaxes uncapped source demand before native clamping and rounds requested levels upward", async () => {
    const f = setup(1);
    mocks.plan.mockReturnValue([
      {
        id: "0",
        priority: 1,
        coverage: [0],
        patches: [
          {
            x: 10,
            y: 10,
            width: 10,
            height: 10,
            density: 1,
            requiredDensity: 2,
          },
        ],
        view: { visible: { x: 10, y: 10, width: 10, height: 10 }, density: 1 },
        requiredDensity: 2,
        nativeLimited: true,
      },
    ]);
    const request = lease();
    mocks.acquire.mockReturnValue(request);
    const hook = renderHook(() => usePhotoMosaic(f.options as never));
    f.fire();
    await settle();
    // Corner-cell error lies between 2 and 4: required2/error rounds up to1;
    // incorrectly using the preclamped density1 would select0.5 instead.
    expect(request.stack.setView.mock.calls[0][0].density).toBe(1);
    expect(mocks.networkActive.size).toBe(0);
    hook.unmount();
  });

  it.each([
    "acquire-throw",
    "metadata-failure",
    "disable",
    "unmount",
    "camera-cancel",
  ] as const)(
    "releases foreground refinement priority after %s",
    async (cause) => {
      const f = setup(1);
      const pending = deferred();
      const request = lease(pending.promise);
      let rejectReady!: (reason: Error) => void;
      if (cause === "metadata-failure")
        request.stack.ready = new Promise<void>((_, reject) => {
          rejectReady = reject;
        });
      mocks.acquire.mockImplementation(() => {
        if (cause === "acquire-throw") throw Error("no pool lease");
        return request;
      });
      const hook = renderHook(
        ({ enabled }) => usePhotoMosaic({ ...f.options, enabled } as never),
        { initialProps: { enabled: true } }
      );
      f.fire();
      await settle();
      if (cause !== "acquire-throw") expect(mocks.networkActive.size).toBe(1);
      if (cause === "metadata-failure") {
        await act(async () => {
          rejectReady(Error("metadata failed"));
          await vi.advanceTimersByTimeAsync(1);
        });
      } else if (cause === "disable") hook.rerender({ enabled: false });
      else if (cause === "unmount") hook.unmount();
      else if (cause === "camera-cancel") {
        f.camera.projectionMatrix.elements[12] = 0.1;
        f.fire();
      }
      expect(mocks.networkActive.size).toBe(0);
      expect(mocks.networkReleases[0]).toHaveBeenCalled();
      if (cause !== "unmount") hook.unmount();
      await act(async () => {
        pending.resolve();
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(mocks.networkActive.size).toBe(0);
    }
  );

  it("prepares more than two photos serially, releases native leases and disposes snapshots when disabled", async () => {
    const f = setup();
    const requests: ReturnType<typeof lease>[] = [];
    mocks.acquire.mockImplementation(() => {
      expect(
        requests.every((item) => item.release.mock.calls.length === 1)
      ).toBe(true);
      const next = lease();
      requests.push(next);
      return next;
    });
    const hook = renderHook(
      ({ enabled }) => usePhotoMosaic({ ...f.options, enabled } as never),
      { initialProps: { enabled: true } }
    );
    f.fire();
    await settle();
    expect(mocks.acquire).toHaveBeenCalledTimes(4);
    expect(mocks.draw).toHaveBeenCalledTimes(4);
    const entries = mocks.setMosaic.mock.calls.at(-1)![1] as {
      texture: Texture;
      priority: number;
    }[];
    expect(entries).toHaveLength(4);
    expect(entries.map((entry) => entry.priority)).toEqual([
      9.5, 7.5, 5.5, 3.5,
    ]);
    const dispose = entries.map((entry) => vi.spyOn(entry.texture, "dispose"));
    const canvases = entries.map(
      (entry) => entry.texture.image as OffscreenCanvas
    );
    expect(hook.result.current.message).toContain("4/4 Fotos");
    expect(hook.result.current.loading).toBe(false);
    hook.rerender({ enabled: false });
    expect(mocks.setMosaic.mock.calls.at(-1)![1]).toBeNull();
    dispose.forEach((spy) => expect(spy).toHaveBeenCalledOnce());
    canvases.forEach((canvas) =>
      expect([canvas.width, canvas.height]).toEqual([1, 1])
    );
    expect(mocks.releaseScene).toHaveBeenCalledOnce();
    expect(mocks.callback).toBeUndefined();
    hook.unmount();
  });

  it("reuses bounded resident bases while keeping the nearest photo above a farther photo’s details", async () => {
    const f = setup(2);
    f.options.resolvePhoto.mockImplementation(async (record) => ({
      record,
      dataset: { previewPath: "preview" },
      calibration: { widthPx: 4096, heightPx: 2048 },
      pose: {},
      altitude: 250,
    }));
    const requests: ReturnType<typeof lease>[] = [];
    const resident = vi.fn(() => true);
    mocks.acquire.mockImplementation(() => {
      const request = lease();
      Object.assign(request.stack, {
        pyramid: {
          native: { width: 4096, height: 2048 },
          levels: [{ level: 6, width: 128, height: 64, cols: 2, rows: 1 }],
        },
        plan: { floor: 6 },
        isResident: resident,
      });
      requests.push(request);
      return request;
    });
    const hook = renderHook(() => usePhotoMosaic(f.options as never));
    f.fire();
    await settle();
    expect(mocks.acquire).toHaveBeenCalledTimes(2);
    requests.forEach((request) =>
      expect(request.stack.setView).toHaveBeenCalledOnce()
    );
    expect(resident.mock.calls).toEqual([
      [6, 0, 0],
      [6, 1, 0],
      [6, 0, 0],
      [6, 1, 0],
    ]);
    expect(mocks.coarseReadBase).not.toHaveBeenCalled();
    expect(mocks.draw).toHaveBeenCalledTimes(4);
    const entries = mocks.setMosaic.mock.calls.at(-1)![1] as {
      texture: Texture;
      priority: number;
      sceneToTexture: Matrix4;
    }[];
    const bases = entries.filter((entry) =>
        entry.sceneToTexture.equals(new Matrix4())
      ),
      details = entries.filter(
        (entry) => !entry.sceneToTexture.equals(new Matrix4())
      );
    expect(bases).toHaveLength(2);
    expect(details).toHaveLength(2);
    expect(bases.map((entry) => entry.priority)).toEqual([4, 2]);
    expect(details.map((entry) => entry.priority)).toEqual([5.5, 3.5]);
    expect(bases[0].priority).toBeGreaterThan(details[1].priority);
    expect(bases[0].priority).toBeLessThan(details[0].priority);
    for (const base of bases) {
      expect([base.texture.image.width, base.texture.image.height]).toEqual([
        512, 256,
      ]);
      expect(base.sceneToTexture.equals(new Matrix4())).toBe(true);
    }
    const dispose = entries.map((entry) => vi.spyOn(entry.texture, "dispose"));
    hook.unmount();
    dispose.forEach((spy) => expect(spy).toHaveBeenCalledOnce());
    entries.forEach((entry) =>
      expect([entry.texture.image.width, entry.texture.image.height]).toEqual([
        1, 1,
      ])
    );
  });

  it("does not advertise an incomplete resident floor as a full-photo base", async () => {
    const f = setup(1),
      request = lease();
    Object.assign(request.stack, {
      pyramid: {
        native: { width: 64, height: 64 },
        levels: [{ level: 6, cols: 2, rows: 1 }],
      },
      plan: { floor: 6 },
      isResident: (_level: number, col: number) => col === 0,
    });
    mocks.acquire.mockReturnValue(request);
    const hook = renderHook(() => usePhotoMosaic(f.options as never));
    f.fire();
    await settle();
    expect(mocks.acquire).toHaveBeenCalledOnce();
    expect(request.stack.setView).toHaveBeenCalledOnce();
    expect(mocks.draw).toHaveBeenCalledOnce();
    expect(mocks.coarseReadBase).toHaveBeenCalled();
    expect(
      mocks.setMosaic.mock.calls
        .at(-1)![1]
        .every((entry: { priority: number }) => entry.priority >= 0)
    ).toBe(true);
    hook.unmount();
  });

  it("does not request hidden high-resolution photos while retaining coarse fallback preparation", async () => {
    const f = setup(2);
    const actual = await vi.importActual<
      typeof import("../../core/utils/photo-mosaic-plan")
    >("../../core/utils/photo-mosaic-plan");
    mocks.plan.mockImplementation(actual.planPhotoMosaic);
    const hook = renderHook(() => usePhotoMosaic(f.options as never));
    f.fire();
    await settle();
    expect(mocks.acquire.mock.calls.length).toBeGreaterThan(0);
    expect(
      new Set(mocks.acquire.mock.calls.map(([source]) => source.imageId))
    ).toEqual(new Set(["0"]));
    const coarse = mocks.coarseUpdate.mock.calls.at(-1)!;
    expect(
      coarse[0].map((source: { imageId: string }) => source.imageId)
    ).toEqual(["0", "1"]);
    expect(coarse[1]).toBe(false);
    expect(mocks.draw.mock.invocationCallOrder.at(-1)).toBeLessThan(
      mocks.coarseUpdate.mock.invocationCallOrder.at(-1)!
    );
    hook.unmount();
    expect(mocks.coarseDispose).toHaveBeenCalledOnce();
  });

  it("deduplicates owned patch tiles and skips the bounding-box gap", async () => {
    const f = setup(1);
    f.options.resolvePhoto.mockImplementation(async (record) => ({
      record,
      dataset: { previewPath: "preview" },
      calibration: { widthPx: 4096, heightPx: 128 },
      pose: {},
      altitude: 250,
    }));
    mocks.plan.mockReturnValue([
      {
        id: "0",
        view: {
          visible: { x: 16, y: 16, width: 3016, height: 32 },
          density: 1,
        },
        patches: [
          {
            x: 16,
            y: 16,
            width: 32,
            height: 32,
            density: 1,
            requiredDensity: 1,
          },
          {
            x: 16,
            y: 16,
            width: 32,
            height: 32,
            density: 1,
            requiredDensity: 1,
          },
          {
            x: 3000,
            y: 16,
            width: 32,
            height: 32,
            density: 1,
            requiredDensity: 1,
          },
        ],
        priority: 1,
        coverage: [31, 31, 31],
        nativeLimited: false,
      },
    ]);
    const requests: ReturnType<typeof lease>[] = [];
    mocks.acquire.mockImplementation(() => {
      const next = lease();
      requests.push(next);
      return next;
    });
    const hook = renderHook(() => usePhotoMosaic(f.options as never));
    f.fire();
    await settle();
    expect(requests).toHaveLength(2);
    expect(
      requests
        .map((request) => request.stack.setView.mock.calls[0][0].visible.x)
        .sort((a, b) => a - b)
    ).toEqual([15, 2999]);
    hook.unmount();
  });

  it("removes the previous series immediately when its mosaic group changes", async () => {
    const f = setup(1);
    const hook = renderHook(
      ({ groupKey }) => usePhotoMosaic({ ...f.options, groupKey } as never),
      { initialProps: { groupKey: "2026:N" } }
    );
    f.fire();
    await settle();
    const texture = mocks.setMosaic.mock.calls.at(-1)![1][0].texture as Texture;
    const dispose = vi.spyOn(texture, "dispose");
    hook.rerender({ groupKey: "2024:N" });
    f.fire();
    expect(dispose).toHaveBeenCalledOnce();
    expect(mocks.setMosaic.mock.calls.at(-1)![1]).toBeNull();
    hook.unmount();
  });

  it("replaces a full old LOD using a coarse retained fallback instead of blocking every new tile", async () => {
    const f = setup(1);
    f.options.resolvePhoto.mockImplementation(async (record) => ({
      record,
      dataset: { previewPath: "preview" },
      calibration: { widthPx: 8192, heightPx: 8192 },
      pose: {},
      altitude: 250,
    }));
    let replacing = false;
    mocks.plan.mockImplementation(() => [
      {
        id: "0",
        view: {
          visible: { x: 0, y: 0, width: 8192, height: 8192 },
          density: replacing ? 1 : 0.5,
        },
        patches: replacing
          ? [
              {
                x: 4096,
                y: 4096,
                width: 1024,
                height: 1024,
                density: 1,
                requiredDensity: 1,
              },
            ]
          : Array.from({ length: 13 }, (_, i) => ({
              x: (i % 4) * 2048,
              y: Math.floor(i / 4) * 2048,
              width: 2048,
              height: 2048,
              density: 0.5,
              requiredDensity: 0.5,
            })),
        priority: 1,
        coverage: Array.from({ length: replacing ? 1 : 13 }, () => 31),
        nativeLimited: false,
      },
    ]);
    const hook = renderHook(() => usePhotoMosaic(f.options as never));
    f.fire();
    await settle();
    const original = mocks.setMosaic.mock.calls.at(-1)![1] as {
      texture: Texture;
    }[];
    expect(original).toHaveLength(13);
    const pending = deferred();
    mocks.acquire.mockReturnValue(lease(pending.promise));
    replacing = true;
    f.camera.projectionMatrix.elements[0] = 1.01;
    f.fire();
    await settle();
    expect(mocks.acquire).toHaveBeenCalledTimes(14);
    const during = mocks.setMosaic.mock.calls.at(-1)![1] as {
      texture: Texture;
    }[];
    expect(during).toHaveLength(13);
    expect(
      during.some(
        (entry) =>
          Math.max(entry.texture.image.width, entry.texture.image.height) ===
          256
      )
    ).toBe(true);
    await act(async () => {
      pending.resolve();
      await vi.advanceTimersByTimeAsync(1);
    });
    const finished = mocks.setMosaic.mock.calls.at(-1)![1] as {
      texture: Texture;
    }[];
    expect(finished).toHaveLength(1);
    expect(finished[0].texture.image.width).toBe(1026);
    expect(hook.result.current.loading).toBe(false);
    hook.unmount();
  });

  it("replans uncovered samples to the next photo when the top photo fails without another camera move", async () => {
    const f = setup(2);
    const actual = await vi.importActual<
      typeof import("../../core/utils/photo-mosaic-plan")
    >("../../core/utils/photo-mosaic-plan");
    mocks.plan.mockImplementation(actual.planPhotoMosaic);
    mocks.acquire.mockImplementation((source) => {
      const request = lease();
      if (source.imageId === "0")
        Object.assign(request.stack, { error: "unavailable top photograph" });
      return request;
    });
    const hook = renderHook(() => usePhotoMosaic(f.options as never));
    f.fire();
    await settle();
    await settle();
    expect(
      mocks.acquire.mock.calls.filter(([source]) => source.imageId === "0")
    ).toHaveLength(1);
    expect(
      mocks.acquire.mock.calls
        .slice(1)
        .every(([source]) => source.imageId === "1")
    ).toBe(true);
    expect(mocks.draw.mock.calls.length).toBeGreaterThan(0);
    expect(mocks.setMosaic.mock.calls.at(-1)![1].length).toBeGreaterThan(0);
    expect(hook.result.current.loading).toBe(false);
    hook.unmount();
  });

  it("samples neighbour offsets in actual reduced output-buffer pixels, not CSS pixels", async () => {
    const f = setup(1);
    mocks.state = {
      requestedWidth: 900,
      requestedHeight: 700,
      width: 450,
      height: 350,
    };
    const hook = renderHook(() => usePhotoMosaic(f.options as never));
    f.fire();
    await settle();
    const input = mocks.plan.mock.calls[0][0];
    expect(input.samples).toHaveLength(63);
    expect(input.centerSampleIndex).toBe(31);
    const center = input.samples[31];
    expect(center.point.x).toBeCloseTo(0);
    expect(center.point.y).toBeCloseTo(0);
    expect(center.dx.x - center.point.x).toBeCloseTo(2 / 450);
    expect(center.dy.y - center.point.y).toBeCloseTo(-2 / 350);
    expect(input.sampleRadiusPixels).toBeCloseTo(
      Math.hypot(450 / 9, 350 / 7) / 2 + 1
    );
    hook.unmount();
  });

  it("does not publish or draw a stale async region after unmount", async () => {
    const f = setup(1),
      pending = deferred(),
      request = lease(pending.promise);
    mocks.acquire.mockReturnValue(request);
    const hook = renderHook(() => usePhotoMosaic(f.options as never));
    f.fire();
    await settle();
    expect(mocks.acquire).toHaveBeenCalledOnce();
    hook.unmount();
    const calls = mocks.setMosaic.mock.calls.length;
    await act(async () => {
      pending.resolve();
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(request.release).toHaveBeenCalled();
    expect(mocks.draw).not.toHaveBeenCalled();
    expect(mocks.setMosaic).toHaveBeenCalledTimes(calls);
    expect(mocks.setMosaic.mock.calls.at(-1)![1]).toBeNull();
  });

  it("rejects silhouette-crossing samples before calling the planner", async () => {
    const f = setup(1);
    let hit = 0;
    f.options.intersectSurface.mockImplementation((cast) => ({
      point: cast.ray.origin.clone().addScaledVector(cast.ray.direction, 1),
      surface: ++hit % 3 === 0 ? "mesh" : "terrain",
    }));
    const hook = renderHook(() => usePhotoMosaic(f.options as never));
    f.fire();
    await settle();
    expect(mocks.plan.mock.calls[0][0].samples).toEqual([]);
    expect(mocks.plan.mock.calls[0][0].centerSampleIndex).toBe(-1);
    hook.unmount();
  });
});

type MosaicEntry = {
  texture: Texture;
  priority: number;
  sceneToTexture: Matrix4;
  sourceProjection: Matrix4;
  outline?: { width: number };
};
const entries = () =>
  (mocks.setMosaic.mock.calls.at(-1)?.[1] ?? []) as MosaicEntry[];
const tickContent = async () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(5);
  });
const progressiveLease = () => {
  const item = lease();
  const resident = new Map<string, ImageBitmap>();
  const content = new Set<() => void>();
  const state = new Set<() => void>();
  const stack = Object.assign(item.stack, {
    pyramid: {
      native: { width: 64, height: 64 },
      levels: [
        {
          level: 2,
          width: 16,
          height: 16,
          tileWidth: 16,
          tileHeight: 16,
          cols: 1,
          rows: 1,
        },
        {
          level: 1,
          width: 32,
          height: 32,
          tileWidth: 16,
          tileHeight: 16,
          cols: 2,
          rows: 2,
        },
        {
          level: 0,
          width: 64,
          height: 64,
          tileWidth: 16,
          tileHeight: 16,
          cols: 4,
          rows: 4,
        },
      ],
    },
    // No complete floor base here: these cases isolate progressive detail updates.
    plan: { layers: [2, 1, 0], floor: 99 },
    tile: (level: number, col: number, row: number) =>
      resident.get(`${level}:${col}:${row}`),
    isResident: (level: number, col: number, row: number) =>
      resident.has(`${level}:${col}:${row}`),
    onContentChange: vi.fn((callback: () => void) => {
      content.add(callback);
      return vi.fn(() => content.delete(callback));
    }),
  });
  stack.metrics.visibleReady = false;
  stack.subscribe.mockImplementation((callback: () => void) => {
    state.add(callback);
    return () => {
      state.delete(callback);
    };
  });
  const put = (level: number, col = 0, row = 0) =>
    resident.set(`${level}:${col}:${row}`, {
      width: 16,
      height: 16,
    } as ImageBitmap);
  return {
    ...item,
    stack,
    resident,
    content,
    state,
    put,
    emitContent: () =>
      act(() => {
        [...content].forEach((callback) => callback());
      }),
    emitState: () =>
      act(() => {
        [...state].forEach((callback) => callback());
      }),
  };
};

describe("photo mosaic debug and live resident quality", () => {
  it("toggles full-photo outlines without resampling or acquiring pixels and preserves strict photo ordering", async () => {
    const f = setup(2);
    const hook = renderHook(
      ({ debug }) => usePhotoMosaic({ ...f.options, debug } as never),
      { initialProps: { debug: false } }
    );
    f.fire();
    await settle();
    const textures = entries().map((item) => item.texture);
    const samples = f.options.intersectSurface.mock.calls.length;
    const plans = mocks.plan.mock.calls.length;
    const acquires = mocks.acquire.mock.calls.length;
    hook.rerender({ debug: true });
    f.fire();
    const outlines = entries().filter((item) => item.outline);
    expect(outlines).toHaveLength(2);
    expect(outlines.map((item) => item.priority)).toEqual([5.9, 3.9]);
    outlines.forEach((item) => {
      expect(item.outline?.width).toBe(1);
      expect(item.sceneToTexture.equals(new Matrix4())).toBe(true);
      expect(
        new Vector3(0.3, 0.7, 0)
          .applyMatrix4(item.sourceProjection)
          .distanceTo(new Vector3(0.3, 0.7, 0))
      ).toBeLessThan(1e-12);
    });
    expect(
      entries()
        .filter((item) => !item.outline)
        .map((item) => item.texture)
    ).toEqual(textures);
    expect(f.options.intersectSurface).toHaveBeenCalledTimes(samples);
    expect(mocks.plan).toHaveBeenCalledTimes(plans);
    expect(mocks.acquire).toHaveBeenCalledTimes(acquires);
    hook.rerender({ debug: false });
    f.fire();
    expect(entries().some((item) => item.outline)).toBe(false);
    expect(entries().map((item) => item.texture)).toEqual(textures);
    hook.unmount();
  });
  it("publishes coarse progress before readiness and upgrades the same stationary ROI texture without new planning or requests", async () => {
    const f = setup(1),
      request = progressiveLease();
    request.put(2);
    mocks.acquire.mockReturnValue(request);
    mocks.peek.mockReturnValue(request.stack);
    const hook = renderHook(() => usePhotoMosaic(f.options as never));
    f.fire();
    await settle();
    expect(hook.result.current.loading).toBe(true);
    expect(request.release).not.toHaveBeenCalled();
    expect(entries()).toHaveLength(1);
    const texture = entries()[0].texture;
    const sourceProjection = entries()[0].sourceProjection.clone();
    // Planning requested a 10x10 native crop starting at (10, 10). The source
    // depth projector must retain the full 64x64 sensor even for this tiny ROI.
    const sensorPoint = new Vector3(0.8, 0.2, 0);
    expect(
      sensorPoint.clone().applyMatrix4(sourceProjection).distanceTo(sensorPoint)
    ).toBeLessThan(1e-12);
    expect(
      sensorPoint.clone().applyMatrix4(entries()[0].sceneToTexture).x
    ).toBeGreaterThan(1);
    const oldVersion = texture.version;
    const draws = mocks.draw.mock.calls.length;
    const samples = f.options.intersectSurface.mock.calls.length;
    const plans = mocks.plan.mock.calls.length;
    request.put(0);
    request.emitContent();
    request.emitContent();
    await tickContent();
    expect(entries()[0].texture).toBe(texture);
    expect(texture.version).toBeGreaterThan(oldVersion);
    expect(entries()[0].sourceProjection.equals(sourceProjection)).toBe(true);
    expect(mocks.draw).toHaveBeenCalledTimes(draws + 1);
    const upgradedVersion = texture.version;
    const upgradedDraws = mocks.draw.mock.calls.length;
    request.emitContent();
    request.emitState();
    mocks.poolChanged?.();
    await tickContent();
    expect(texture.version).toBe(upgradedVersion);
    expect(mocks.draw).toHaveBeenCalledTimes(upgradedDraws);
    request.resident.delete("0:0:0");
    request.emitContent();
    await tickContent();
    expect(texture.version).toBe(upgradedVersion);
    expect(mocks.draw).toHaveBeenCalledTimes(upgradedDraws);
    for (let row = 0; row < 2; row++)
      for (let col = 0; col < 2; col++) request.put(0, col, row);
    request.stack.metrics.visibleReady = true;
    request.emitState();
    await tickContent();
    expect(request.release).toHaveBeenCalledOnce();
    expect(hook.result.current.loading).toBe(false);
    const completedVersion = texture.version;
    const completedDraws = mocks.draw.mock.calls.length;
    request.put(0, 1, 1);
    request.emitContent();
    await tickContent();
    expect(texture.version).toBeGreaterThan(completedVersion);
    expect(mocks.draw).toHaveBeenCalledTimes(completedDraws + 1);
    expect(entries()[0].texture).toBe(texture);
    expect(mocks.acquire).toHaveBeenCalledOnce();
    expect(request.stack.setView).toHaveBeenCalledOnce();
    expect(f.options.intersectSurface).toHaveBeenCalledTimes(samples);
    expect(mocks.plan).toHaveBeenCalledTimes(plans);
    const dispose = vi.spyOn(texture, "dispose");
    hook.unmount();
    expect(request.content.size).toBe(0);
    expect(request.state.size).toBe(0);
    expect(mocks.poolUnsubscribe).toHaveBeenCalledOnce();
    expect(dispose).toHaveBeenCalledOnce();
    const published = mocks.setMosaic.mock.calls.length;
    request.emitContent();
    mocks.poolChanged?.();
    await tickContent();
    expect(mocks.setMosaic).toHaveBeenCalledTimes(published);
  });
  it.each(["resident", "prefetched"] as const)(
    "upgrades an upscaled %s base using actual source density rather than its canvas density",
    async (origin) => {
      const f = setup(1),
        request = progressiveLease();
      request.put(2);
      request.stack.metrics.visibleReady = true;
      if (origin === "resident") request.stack.plan.floor = 2;
      else
        mocks.coarseReadBase.mockImplementation(
          async () => new OffscreenCanvas(16, 16)
        );
      mocks.acquire.mockReturnValue(request);
      mocks.peek.mockReturnValue(request.stack);
      const hook = renderHook(() => usePhotoMosaic(f.options as never));
      f.fire();
      await settle();
      const base = entries().find((item) => item.priority === 2)!;
      expect(base).toBeDefined();
      expect(base.texture.image).toMatchObject({ width: 64, height: 64 });
      const version = base.texture.version;
      const draws = mocks.draw.mock.calls.length;
      request.put(1);
      request.emitContent();
      await tickContent();
      expect(entries().find((item) => item.priority === 2)!.texture).toBe(
        base.texture
      );
      expect(base.texture.version).toBeGreaterThan(version);
      expect(mocks.draw.mock.calls.length).toBeGreaterThan(draws);
      const improvedVersion = base.texture.version;
      request.resident.delete("1:0:0");
      request.emitContent();
      await tickContent();
      expect(base.texture.version).toBe(improvedVersion);
      expect(mocks.acquire).toHaveBeenCalledOnce();
      expect(request.stack.setView).toHaveBeenCalledOnce();
      hook.unmount();
    }
  );
  it("rebinds passive content observation when the pool replaces a contributor stack", async () => {
    const f = setup(1),
      request = progressiveLease();
    request.put(2);
    request.stack.metrics.visibleReady = true;
    mocks.acquire.mockReturnValue(request);
    mocks.peek.mockReturnValue(request.stack);
    const hook = renderHook(() => usePhotoMosaic(f.options as never));
    f.fire();
    await settle();
    const texture = entries()[0].texture;
    const replacement = progressiveLease();
    for (const [key, value] of request.resident)
      replacement.resident.set(key, value);
    replacement.put(0);
    const before = texture.version;
    mocks.peek.mockReturnValue(replacement.stack);
    mocks.poolChanged?.();
    await tickContent();
    expect(request.content.size).toBe(0);
    expect(replacement.content.size).toBe(1);
    expect(texture.version).toBeGreaterThan(before);
    expect(mocks.acquire).toHaveBeenCalledOnce();
    expect(replacement.stack.setView).not.toHaveBeenCalled();
    hook.unmount();
    expect(replacement.content.size).toBe(0);
  });
  it.each(["cancel", "unmount"])(
    "ignores late progressive content after %s",
    async (action) => {
      const f = setup(1),
        request = progressiveLease();
      request.put(2);
      mocks.acquire.mockReturnValue(request);
      mocks.peek.mockReturnValue(request.stack);
      const hook = renderHook(
        ({ groupKey }) => usePhotoMosaic({ ...f.options, groupKey } as never),
        { initialProps: { groupKey: "2026:N" } }
      );
      f.fire();
      await settle();
      const texture = entries()[0].texture;
      const dispose = vi.spyOn(texture, "dispose");
      if (action === "cancel") {
        hook.rerender({ groupKey: "2024:N" });
        f.fire();
      } else hook.unmount();
      const draws = mocks.draw.mock.calls.length;
      request.put(0);
      request.emitContent();
      request.stack.metrics.visibleReady = true;
      request.emitState();
      await tickContent();
      expect(mocks.draw).toHaveBeenCalledTimes(draws);
      expect(entries()).toHaveLength(0);
      expect(dispose).toHaveBeenCalledOnce();
      expect(request.content.size).toBe(0);
      if (action === "cancel") hook.unmount();
    }
  );
});
