import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { degToRad, type Degrees } from "@carma-units";
import type { Map as MaplibreMap } from "maplibre-gl";
import type {
  NearestObliqueImageRecord,
  ObliqueDataset,
  ObliqueGroundTarget,
  ObliqueSelectionData,
  ObliqueViewMode,
  ObliqueMetadata,
  ObliqueViewQuery,
} from "../../core/types";
import { Vector3 } from "three";
import { getProj4Converter } from "@carma-geo/proj";
import { buildImageRecords } from "../../core/utils/imageRecord";
import { createImageSelectionIndex } from "../../core/utils/image-selection-index";
import {
  estimateGroundCenter,
  rankImagesForView,
} from "../../core/utils/selection";
import {
  TEST_INPHO_SERIES,
  TEST_LEGACY_SERIES,
} from "../../core/utils/synthetic-series.test-fixture";
import { CardinalDirectionEnum } from "../../core/utils/orientation";
import { OBLIQUE_NAVIGATION_KEYS } from "../oblique-actions";
import { useObliqueNavigationTargets } from "./useObliqueNavigationTargets";
const mocks = vi.hoisted(() => ({
  pose: vi.fn(),
  pan: vi.fn(),
}));
vi.mock("../utils/flyToImage", () => ({
  poseOf: mocks.pose,
}));
vi.mock("../../core/utils/selection", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../core/utils/selection")>()),
  panViewTarget: mocks.pan,
}));
const selected = (id: string): NearestObliqueImageRecord => ({
  record: {
    id,
    sourceId: id,
    seriesId: "series",
    cameraId: "170",
    z: 900,
  } as NearestObliqueImageRecord["record"],
  distanceOnGround: 0,
  distanceToCamera: 1,
  coversTarget: true,
  imageCenter: {
    x: 0,
    y: 0,
    longitude: 7.25,
    latitude: 51.28,
    cardinal: CardinalDirectionEnum.North,
  },
});
const dataset: ObliqueDataset = {
  ...TEST_LEGACY_SERIES,
  id: "series",
  heightDatum: "dhhn2016",
  referenceGroundHeightMeters: 200,
};
const data: ObliqueSelectionData = {
  datasets: new Map([[dataset.id, dataset]]),
  imageRecords: new Map(),
  centers: new Map(),
};
const pending = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
};
let listeners: Map<string, Set<(event?: unknown) => void>>;
let liveBearing = 111;
const map = {
  getBearing: () => liveBearing,
  getPitch: () => 12,
  on: (name: string, fn: (event?: unknown) => void) => {
    let list = listeners.get(name);
    if (!list) {
      list = new Set();
      listeners.set(name, list);
    }
    list.add(fn);
  },
  off: (name: string, fn: (event?: unknown) => void) =>
    listeners.get(name)?.delete(fn),
} as unknown as MaplibreMap;
const emit = (name: string, event = {}) =>
  listeners.get(name)?.forEach((fn) => fn(event));
const flush = () =>
  act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
const mount = (
  nextInterface = false,
  initialTarget: ObliqueGroundTarget | null = {
    longitude: 7.2,
    latitude: 51.27,
    heightMeters: 250,
    heightDatum: "dhhn2016",
  },
  config: {
    rank?: Parameters<
      typeof useObliqueNavigationTargets
    >[0]["computeNavigation"];
    ensureDirections?: Parameters<
      typeof useObliqueNavigationTargets
    >[0]["ensureDirections"];
    readRotationTarget?: Parameters<
      typeof useObliqueNavigationTargets
    >[0]["readRotationTarget"];
    onLookAheadGroup?: Parameters<
      typeof useObliqueNavigationTargets
    >[0]["onLookAheadGroup"];
    data?: ObliqueSelectionData;
    image?: NearestObliqueImageRecord;
    busy?: boolean;
    previewCameraActive?: boolean;
  } = {}
) => {
  const publish = vi.fn(),
    lookAhead = vi.fn(),
    computeNavigation = vi
      .fn()
      .mockImplementation(async (queries) =>
        config.rank
          ? config.rank(queries)
          : queries.map(() => [selected("next")])
      );
  const targetRef: { current: ObliqueGroundTarget | null } = {
      current: initialTarget,
    },
    busyRef = { current: config.busy ?? false };
  const view = renderHook(
    ({
      image,
      data,
      mode = "oblique",
      enabled = true,
      rotationReady = true,
    }: {
      image: NearestObliqueImageRecord | null;
      data: ObliqueSelectionData | null;
      mode?: ObliqueViewMode;
      enabled?: boolean;
      rotationReady?: boolean;
    }) =>
      useObliqueNavigationTargets({
        map,
        data,
        selectedImage: image,
        enabled,
        rotationReady,
        viewMode: mode,
        previewCameraActive: config.previewCameraActive ?? true,
        nextInterface,
        targetRef,
        busyRef,
        readTarget: () => targetRef.current,
        readRotationTarget: config.readRotationTarget,
        computeNavigation,
        ensureDirections: config.ensureDirections,
        publish,
        onLookAhead: lookAhead,
        onLookAheadGroup: config.onLookAheadGroup,
      }),
    {
      initialProps: {
        image: config.image ?? selected("current"),
        data: config.data ?? data,
      },
    }
  );
  return { ...view, publish, lookAhead, computeNavigation, targetRef, busyRef };
};
beforeEach(() => {
  listeners = new Map();
  liveBearing = 111;
  mocks.pose.mockReturnValue({ bearingDeg: 325, pitchDeg: 45 });
  mocks.pan.mockImplementation((_r, _d, target, movement) => ({
    ...target,
    longitude: target.longitude + movement.right * 0.01,
    latitude: target.latitude + movement.forward * 0.01,
  }));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});
describe("prepared navigation target cache", () => {
  it.each([false, true])(
    "generates rotation headings from the actual %s UI convention",
    async (nextInterface) => {
      const view = mount(nextInterface);
      await flush();
      const queries = view.computeNavigation.mock.calls[0][0];
      const left = nextInterface ? 235 : 415;
      const right = nextInterface ? 415 : 235;
      expect(queries[4].headingRad).toBeCloseTo(degToRad(left as Degrees));
      expect(queries[5].headingRad).toBeCloseTo(degToRad(right as Degrees));
    }
  );

  it("uses the visible scene center and pure center order for classic rotation, capture topology for arrows", async () => {
    const view = mount(false);
    await flush();
    const queries = view.computeNavigation.mock.calls[0][0];
    expect(
      queries
        .slice(0, 4)
        .every(
          (query) =>
            query.navigationSelection === "capture-neighbor" &&
            query.navigationArrow
        )
    ).toBe(true);
    expect(
      queries
        .slice(4)
        .every(
          (query) =>
            query.navigationSelection === "center-distance" &&
            query.target.longitude === 7.2 &&
            query.navigationArrow === undefined
        )
    ).toBe(true);
  });

  it("rejects previous screen-axis targets immediately after an orbit, before moveend", async () => {
    const view = mount(false, undefined, { previewCameraActive: false });
    await flush();
    expect(
      view.result.current.getTarget(OBLIQUE_NAVIGATION_KEYS.Right)
    ).toBeDefined();
    liveBearing += 90;
    expect(
      view.result.current.getTarget(OBLIQUE_NAVIGATION_KEYS.Right)
    ).toBeUndefined();
    const activate = vi.fn(async (_target: { headingRad: number }) => {});
    let requested!: Promise<boolean>;
    act(() => {
      requested = view.result.current.requestTarget(
        OBLIQUE_NAVIGATION_KEYS.Right,
        activate
      );
    });
    await flush();
    expect(await requested).toBe(true);
    expect(activate.mock.calls[0][0].headingRad).toBe(degToRad(201 as Degrees));
  });

  it.each([
    { previewCameraActive: true, busy: false, heading: 325 },
    { previewCameraActive: false, busy: false, heading: 111 },
    { previewCameraActive: false, busy: true, heading: 325 },
  ])(
    "uses the same view heading for arrow displacement and ranking: %j",
    async (state) => {
      const view = mount(false, undefined, state);
      await flush();
      const queries = view.computeNavigation.mock.calls[0][0];
      const headingRad = degToRad(state.heading as Degrees);
      for (let i = 0; i < 4; i += 1) {
        expect(mocks.pan.mock.calls[i][3].headingRad).toBe(headingRad);
        expect(queries[i].headingRad).toBe(headingRad);
      }
    }
  );

  it("publishes geometry targets without waiting for camera altitude or media", async () => {
    const view = mount();
    await flush();
    expect(view.computeNavigation.mock.calls[0][0]).toHaveLength(6);
    expect(view.computeNavigation.mock.calls[0][0][0]).toMatchObject({
      excludeImageId: "current",
      numCandidates: 4,
      headingRad: degToRad(325 as Degrees),
    });
    expect(
      view.computeNavigation.mock.calls[0][0]
        .slice(0, 4)
        .every((query) => query.navigationOrigin?.longitude === 7.25)
    ).toBe(true);
    expect(
      view.computeNavigation.mock.calls[0][0][0].target.longitude
    ).toBeCloseTo(7.24);
    expect(
      view.result.current.getTarget(OBLIQUE_NAVIGATION_KEYS.Left)?.candidate
        .record.id
    ).toBe("next");
    expect(
      view.computeNavigation.mock.calls[0][0]
        .slice(4)
        .every((query) => query.navigationOrigin === undefined)
    ).toBe(true);
    expect(view.publish.mock.calls.at(-1)?.[0].images.left).toBe("next");
    expect(view.lookAhead).not.toHaveBeenCalled();
  });
  it("recomputes once after moveend80, invalidates stale panned origins, and prepares four NG cardinals", async () => {
    vi.useFakeTimers();
    const view = mount(true);
    await flush();
    expect(view.computeNavigation.mock.calls[0][0]).toHaveLength(10);
    expect(
      view.computeNavigation.mock.calls[0][0][0].target.longitude
    ).toBeCloseTo(7.19);
    view.targetRef.current = { ...view.targetRef.current!, longitude: 7.4 };
    const settledTargets = view.publish.mock.calls.at(-1)?.[0];
    act(() => {
      emit("moveend");
      emit("moveend");
    });
    expect(
      view.result.current.getTarget(OBLIQUE_NAVIGATION_KEYS.Left)
    ).toBeUndefined();
    expect(view.publish.mock.calls.at(-1)?.[0]).toBe(settledTargets);
    expect(view.computeNavigation).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(79));
    expect(view.computeNavigation).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(view.computeNavigation).toHaveBeenCalledTimes(2);
  });
  it.each(["catalog", "ranking"] as const)(
    "ignores an obsolete %s failure after a newer target batch has settled",
    async (stage) => {
      let reject!: (error: Error) => void;
      const obsolete = new Promise<never>((_resolve, fail) => {
        reject = fail;
      });
      let catalogCalls = 0,
        rankingCalls = 0;
      const view = mount(false, undefined, {
        ensureDirections: () =>
          stage === "catalog" && ++catalogCalls === 1
            ? obsolete
            : Promise.resolve(),
        rank: (queries) =>
          stage === "ranking" && ++rankingCalls === 1
            ? obsolete
            : Promise.resolve(queries.map(() => [selected("new-target")])),
      });
      await flush();
      view.rerender({
        image: selected("current"),
        data: { ...data, centers: new Map(data.centers) },
      });
      await flush();
      const settled = view.publish.mock.calls.at(-1)?.[0];
      expect(settled.images.right).toBe("new-target");
      await act(async () => {
        reject(new Error("obsolete generation failed"));
      });
      await flush();
      expect(view.publish.mock.calls.at(-1)?.[0]).toBe(settled);
      expect(
        view.result.current.getTarget(OBLIQUE_NAVIGATION_KEYS.Right)?.candidate
          .record.id
      ).toBe("new-target");
      const activate = vi.fn(async () => {});
      expect(
        await view.result.current.requestTarget(
          OBLIQUE_NAVIGATION_KEYS.Right,
          activate
        )
      ).toBe(true);
      expect(activate).toHaveBeenCalledOnce();
    }
  );

  it("keeps last direction and prefetches only that next target after the selected image changes", async () => {
    const view = mount();
    await flush();
    act(() =>
      view.result.current.rememberDirection(OBLIQUE_NAVIGATION_KEYS.Up)
    );
    view.rerender({ image: selected("following"), data });
    await flush();
    expect(view.lookAhead).toHaveBeenCalledTimes(2);
    expect(view.lookAhead.mock.calls[0][0].record.id).toBe("next");
    expect(
      view.result.current.getTarget(OBLIQUE_NAVIGATION_KEYS.Up)?.originImageId
    ).toBe("following");
    act(() => emit("movestart", { originalEvent: new Event("pointerdown") }));
    expect(
      view.result.current.getTarget(OBLIQUE_NAVIGATION_KEYS.Up)
    ).toBeUndefined();
  });
  it("keeps published Classic buttons usable when ground height/datum are missing or target is null", async () => {
    const view = mount(false, { longitude: 7.2, latitude: 51.27 });
    await flush();
    const published = view.publish.mock.calls.at(-1)?.[0];
    expect(Object.values(published.images)).toEqual(Array(6).fill("next"));
    const right = view.result.current.getTarget(OBLIQUE_NAVIGATION_KEYS.Right);
    expect(right?.candidate.record.id).toBe(published.images.right);
    expect(right?.target.heightMeters).toBe(200);
    expect(right?.target.heightDatum).toBe("dhhn2016");
    view.targetRef.current = null;
    expect(view.result.current.getTarget(OBLIQUE_NAVIGATION_KEYS.Right)).toBe(
      right
    );
    expect(view.computeNavigation).toHaveBeenCalledOnce();
  });
  it("keeps settled buttons stable and replaces them after the camera settles", async () => {
    vi.useFakeTimers();
    const view = mount(false, { longitude: 7.2, latitude: 51.27 });
    await flush();
    const settledTargets = view.publish.mock.calls.at(-1)?.[0];
    expect(
      view.result.current.getTarget(OBLIQUE_NAVIGATION_KEYS.Right)?.candidate
        .record.id
    ).toBe("next");
    view.targetRef.current = {
      longitude: 7.2,
      latitude: 51.27,
      heightMeters: 201,
      heightDatum: "dhhn2016",
    };
    expect(
      view.result.current.getTarget(OBLIQUE_NAVIGATION_KEYS.Right)
    ).toBeUndefined();
    act(() => emit("moveend"));
    expect(view.publish.mock.calls.at(-1)?.[0]).toBe(settledTargets);
    await act(async () => vi.advanceTimersByTimeAsync(80));
    await flush();
    expect(view.computeNavigation).toHaveBeenCalledTimes(2);
    // A fresh height sample with the same neighbors must not rerender the buttons.
    expect(view.publish.mock.calls.at(-1)?.[0]).toBe(settledTargets);
  });
  it("prepares targets during a flight but publishes only once the position settles", async () => {
    vi.useFakeTimers();
    const view = mount(false, undefined, { busy: true });
    await flush();
    expect(
      view.result.current.getTarget(OBLIQUE_NAVIGATION_KEYS.Right)
    ).toBeDefined();
    expect(view.publish).not.toHaveBeenCalled();
    view.busyRef.current = false;
    act(() => emit("moveend"));
    await act(async () => vi.advanceTimersByTimeAsync(80));
    await flush();
    expect(view.publish).toHaveBeenCalledOnce();
    expect(view.publish.mock.calls[0][0].images.right).toBe("next");
  });
  it("ranks and prepares NG rotations against the configured surface pivot", async () => {
    const pivot: ObliqueGroundTarget = {
      longitude: 7.3,
      latitude: 51.3,
      heightMeters: 180,
      heightDatum: "dhhn2016",
    };
    const readRotationTarget = vi.fn(() => pivot);
    const view = mount(true, undefined, { readRotationTarget });
    await flush();
    const queries = view.computeNavigation.mock.calls[0][0];
    expect(queries.slice(4).every((query) => query.target === pivot)).toBe(
      true
    );
    expect(
      view.result.current.getTarget(OBLIQUE_NAVIGATION_KEYS.RotateRight)?.target
    ).toBe(pivot);
    expect(
      view.result.current.getCardinal(CardinalDirectionEnum.North)?.target
    ).toBe(pivot);
    expect(readRotationTarget).toHaveBeenCalledOnce();
  });
});

describe("semantic navigation FIFO", () => {
  const rank: NonNullable<
    Parameters<typeof useObliqueNavigationTargets>[0]["computeNavigation"]
  > = async (queries) =>
    queries.map((query, index) => [
      selected(`${query.excludeImageId}-${index}`),
    ]);
  const advance = (ms: number) =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });

  it("preserves mixed keys, awaits each flight and resolves each step from the then-current image at least200ms apart", async () => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "Date", "performance"],
    });
    const view = mount(false, undefined, { rank });
    view.busyRef.current = false;
    await flush();
    const gates = [pending<void>(), pending<void>(), pending<void>()],
      starts: number[] = [],
      trace: string[] = [];
    const activate =
      (key: string) =>
      async (
        target: Parameters<
          Parameters<typeof view.result.current.requestTarget>[1]
        >[0]
      ) => {
        const at = trace.length;
        trace.push(`${key}:${target.originImageId}`);
        starts.push(performance.now());
        view.rerender({ image: target.candidate, data });
        await gates[at].promise;
      };
    let results!: Promise<boolean>[];
    act(() => {
      results = [
        view.result.current.requestTarget(
          OBLIQUE_NAVIGATION_KEYS.Right,
          activate("right")
        ),
        view.result.current.requestTarget(
          OBLIQUE_NAVIGATION_KEYS.Up,
          activate("up")
        ),
        view.result.current.requestTarget(
          OBLIQUE_NAVIGATION_KEYS.Right,
          activate("right")
        ),
      ];
    });
    await advance(250);
    expect(trace).toEqual(["right:current"]);
    await act(async () => {
      gates[0].resolve();
    });
    await flush();
    expect(trace).toEqual(["right:current", "up:current-1"]);
    await act(async () => {
      gates[1].resolve();
    });
    await advance(199);
    expect(trace).toHaveLength(2);
    await advance(1);
    expect(trace).toEqual([
      "right:current",
      "up:current-1",
      "right:current-1-2",
    ]);
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(200);
    expect(starts[2] - starts[1]).toBeGreaterThanOrEqual(200);
    await act(async () => {
      gates[2].resolve();
    });
    expect(await Promise.all(results)).toEqual([true, true, true]);
  });

  it("retains all eight repeated/mixed image keys instead of replacing any with a later key", async () => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "Date", "performance"],
    });
    const view = mount(false, undefined, { rank });
    view.busyRef.current = false;
    await flush();
    const keys = [
        OBLIQUE_NAVIGATION_KEYS.Right,
        OBLIQUE_NAVIGATION_KEYS.Right,
        OBLIQUE_NAVIGATION_KEYS.Right,
        OBLIQUE_NAVIGATION_KEYS.Down,
        OBLIQUE_NAVIGATION_KEYS.Down,
        OBLIQUE_NAVIGATION_KEYS.RotateLeft,
        OBLIQUE_NAVIGATION_KEYS.RotateRight,
        OBLIQUE_NAVIGATION_KEYS.Up,
      ],
      trace: string[] = [],
      origins: string[] = [];
    const results: Promise<boolean>[] = [];
    act(() => {
      for (const key of keys)
        results.push(
          view.result.current.requestTarget(key, async (target) => {
            trace.push(key);
            origins.push(target.originImageId);
            view.rerender({ image: target.candidate, data });
          })
        );
    });
    // Separate timer turns let React commit the new selected photo as it does
    // between real flights; one giant async act would batch all virtual turns.
    for (let i = 0; i < keys.length; i++) await advance(200);
    expect(trace).toEqual(keys);
    expect(new Set(origins).size).toBe(8);
    expect(await Promise.all(results)).toEqual(Array(8).fill(true));
  });

  it("prepares once after a silent invalidation and replays repeated queued keys without a moveend", async () => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "Date", "performance"],
    });
    const preparation = pending<ReturnType<typeof rank>>();
    let batches = 0;
    const view = mount(false, undefined, {
      rank: (queries) =>
        ++batches === 2 ? preparation.promise : Promise.resolve(rank(queries)),
    });
    await flush();
    const settled = view.publish.mock.calls.at(-1)?.[0];
    act(() => view.result.current.invalidate(false));
    const keys = [
      OBLIQUE_NAVIGATION_KEYS.Right,
      OBLIQUE_NAVIGATION_KEYS.Right,
      OBLIQUE_NAVIGATION_KEYS.Up,
    ];
    const trace: string[] = [],
      results: Promise<boolean>[] = [];
    act(() => {
      for (const key of keys)
        results.push(
          view.result.current.requestTarget(key, async (target) => {
            trace.push(key);
            view.rerender({ image: target.candidate, data });
          })
        );
    });
    await flush();
    expect(view.computeNavigation).toHaveBeenCalledTimes(2);
    expect(view.publish.mock.calls.at(-1)?.[0]).toBe(settled);
    expect(trace).toEqual([]);
    await act(async () => {
      preparation.resolve(rank(view.computeNavigation.mock.calls[1][0]));
    });
    for (let index = 0; index < keys.length; index++) await advance(200);
    expect(trace).toEqual(keys);
    expect(await Promise.all(results)).toEqual([true, true, true]);
  });

  it("waits for direction catalogs/cache revisions and ignores an older geometry batch without dropping the FIFO", async () => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "Date", "performance"],
    });
    const catalogs = pending<void>(),
      oldBatch = pending<Awaited<ReturnType<typeof rank>>>(),
      newBatch = pending<Awaited<ReturnType<typeof rank>>>();
    let batches = 0;
    const ensure = vi.fn(() => catalogs.promise);
    const view = mount(false, undefined, {
      ensureDirections: ensure,
      rank: () => (++batches === 1 ? oldBatch.promise : newBatch.promise),
    });
    view.busyRef.current = false;
    const activate = vi.fn(async () => {});
    const done = view.result.current.requestTarget(
      OBLIQUE_NAVIGATION_KEYS.Right,
      activate
    );
    expect(view.computeNavigation).not.toHaveBeenCalled();
    await act(async () => {
      catalogs.resolve();
    });
    expect(view.computeNavigation).toHaveBeenCalledOnce();
    const revised = { ...data, centers: new Map(data.centers) };
    view.rerender({ image: selected("current"), data: revised });
    await flush();
    await act(async () => {
      oldBatch.resolve([[selected("old")]]);
    });
    expect(activate).not.toHaveBeenCalled();
    await act(async () => {
      newBatch.resolve(Array.from({ length: 6 }, () => [selected("new")]));
    });
    await flush();
    expect(activate).toHaveBeenCalledWith(
      expect.objectContaining({
        candidate: expect.objectContaining({
          record: expect.objectContaining({ id: "new" }),
        }),
      })
    );
    expect(await done).toBe(true);
  });

  it("keeps mode actions in FIFO, toggles dynamically twice and waits for a matching nadir/oblique photo", async () => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "Date", "performance"],
    });
    const modeData = {
      ...data,
      datasets: new Map([
        [
          dataset.id,
          {
            ...dataset,
            cameras: {
              ...dataset.cameras,
              nadir: { ...dataset.cameras["170"], view: "nadir" as const },
            },
          },
        ],
      ]),
    };
    const modeRank: typeof rank = async (queries) =>
      queries.map((query, index) => {
        const candidate = selected(`${query.excludeImageId}-${index}`);
        return [
          {
            ...candidate,
            record: {
              ...candidate.record,
              cameraId: query.cameraView === "nadir" ? "nadir" : "170",
            },
          },
        ];
      });
    const view = mount(true, undefined, { rank: modeRank });
    view.busyRef.current = false;
    view.rerender({ image: selected("current"), data: modeData });
    await flush();
    let mode: ObliqueViewMode = "oblique",
      image = selected("current");
    const modes: string[] = [],
      steps: string[] = [];
    const toggle = async () => {
      mode = mode === "nadir" ? "oblique" : "nadir";
      modes.push(mode);
      view.rerender({ image, data: modeData, mode });
    };
    const move = async (
      target: Parameters<
        Parameters<typeof view.result.current.requestTarget>[1]
      >[0]
    ) => {
      image = target.candidate;
      steps.push(image.record.cameraId);
      view.rerender({ image, data: modeData, mode });
    };
    let results!: Promise<boolean>[];
    act(() => {
      results = [
        view.result.current.requestAction(toggle),
        view.result.current.requestTarget(OBLIQUE_NAVIGATION_KEYS.Right, move),
        view.result.current.requestAction(toggle),
        view.result.current.requestTarget(OBLIQUE_NAVIGATION_KEYS.Down, move),
      ];
    });
    await advance(500);
    expect(modes).toEqual(["nadir"]);
    expect(steps).toEqual([]);
    image = {
      ...selected("nadir-current"),
      record: { ...selected("nadir-current").record, cameraId: "nadir" },
    };
    view.rerender({ image, data: modeData, mode });
    await flush();
    expect(steps).toEqual(["nadir"]);
    await advance(200);
    expect(modes).toEqual(["nadir", "oblique"]);
    expect(steps).toEqual(["nadir"]);
    image = selected("oblique-current");
    view.rerender({ image, data: modeData, mode });
    await advance(200);
    expect(steps).toEqual(["nadir", "170"]);
    expect(await Promise.all(results)).toEqual(Array(4).fill(true));
  });

  it("yields after at most eight missing-neighbor noops per task while resolving every input", async () => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "Date", "performance"],
    });
    const batch = pending<Awaited<ReturnType<typeof rank>>>(),
      view = mount(false, undefined, { rank: () => batch.promise });
    view.busyRef.current = false;
    const activate = vi.fn(async () => {}),
      settled: boolean[] = [],
      results: Promise<boolean>[] = [];
    for (let i = 0; i < 20; i++)
      results.push(
        view.result.current
          .requestTarget(OBLIQUE_NAVIGATION_KEYS.Right, activate)
          .then((value) => {
            settled.push(value);
            return value;
          })
      );
    await act(async () => {
      batch.resolve(Array(6).fill(undefined));
    });
    await flush();
    expect(settled).toHaveLength(8);
    await act(async () => {
      await vi.advanceTimersToNextTimerAsync();
    });
    expect(settled).toHaveLength(16);
    await act(async () => {
      await vi.advanceTimersToNextTimerAsync();
    });
    expect(settled).toHaveLength(20);
    expect(await Promise.all(results)).toEqual(Array(20).fill(false));
    expect(activate).not.toHaveBeenCalled();
  });

  it("prefetches the next queued direction while a preceding flight is pending, ahead of the remembered direction", async () => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "Date", "performance"],
    });
    const view = mount(false, undefined, { rank, busy: true });
    await flush();
    view.result.current.rememberDirection(OBLIQUE_NAVIGATION_KEYS.Left);
    const gate = pending<void>();
    const activate = async (
      target: Parameters<
        Parameters<typeof view.result.current.requestTarget>[1]
      >[0]
    ) => {
      view.rerender({ image: target.candidate, data });
      await gate.promise;
    };
    const first = view.result.current.requestTarget(
        OBLIQUE_NAVIGATION_KEYS.Right,
        activate
      ),
      second = view.result.current.requestTarget(
        OBLIQUE_NAVIGATION_KEYS.Up,
        async () => {}
      );
    expect(view.lookAhead.mock.calls.at(-1)?.[0].record.id).toBe("current-1");
    view.busyRef.current = false;
    await advance(50);
    await flush();
    expect(view.lookAhead.mock.calls.at(-1)?.[0].record.id).toBe("current-1-2");
    view.result.current.cancel();
    await act(async () => {
      gate.resolve();
    });
    expect(await Promise.all([first, second])).toEqual([false, false]);
  });

  it.each([
    "cancel",
    "gesture",
    "disabled",
    "objectCoverage",
    "unmount",
  ] as const)(
    "cancels queued entries on %s and never replays a late ready batch",
    async (how) => {
      const batch = pending<Awaited<ReturnType<typeof rank>>>(),
        view = mount(false, undefined, { rank: () => batch.promise });
      view.busyRef.current = false;
      const activate = vi.fn(async () => {}),
        requests = [
          view.result.current.requestTarget(
            OBLIQUE_NAVIGATION_KEYS.Right,
            activate
          ),
          view.result.current.requestTarget(
            OBLIQUE_NAVIGATION_KEYS.Up,
            activate
          ),
        ];
      if (how === "cancel") view.result.current.cancel();
      if (how === "gesture")
        act(() =>
          emit("movestart", { originalEvent: new Event("pointerdown") })
        );
      if (how === "disabled")
        view.rerender({ image: selected("current"), data, enabled: false });
      if (how === "objectCoverage")
        view.rerender({
          image: selected("current"),
          data,
          mode: "objectCoverage",
        });
      if (how === "unmount") view.unmount();
      await act(async () => {
        batch.resolve(Array.from({ length: 6 }, () => [selected("late")]));
      });
      expect(await Promise.all(requests)).toEqual([false, false]);
      expect(activate).not.toHaveBeenCalled();
    }
  );
});

describe("rotation waits for the complete oblique catalog", () => {
  it("prepares only four current-slice pan plans and publishes no rotation/cardinal targets before completion", async () => {
    const ensure = vi.fn(async () => {}),
      view = mount(true, undefined, { ensureDirections: ensure });
    view.rerender({ image: selected("current"), data, rotationReady: false });
    await flush();
    const queries = view.computeNavigation.mock.calls.at(-1)![0];
    expect(queries).toHaveLength(4);
    expect(new Set(queries.map((query) => query.headingRad)).size).toBe(1);
    expect(ensure.mock.calls.at(-1)![0]).toHaveLength(4);
    const published = view.publish.mock.calls.at(-1)![0];
    expect(published.images.left).toBe("next");
    expect(published.images.right).toBe("next");
    expect(published.images.up).toBe("next");
    expect(published.images.down).toBe("next");
    expect(published.images.rotateLeft).toBeNull();
    expect(published.images.rotateRight).toBeNull();
    expect(Object.values(published.cardinalImages)).toEqual(
      Array(4).fill(null)
    );
    expect(
      view.result.current.getCardinal(CardinalDirectionEnum.North)
    ).toBeUndefined();
    const activate = vi.fn(async () => {});
    expect(
      await view.result.current.requestTarget(
        OBLIQUE_NAVIGATION_KEYS.RotateRight,
        activate
      )
    ).toBe(false);
    expect(
      await view.result.current.requestTarget(
        OBLIQUE_NAVIGATION_KEYS.RotateLeft,
        activate
      )
    ).toBe(false);
    expect(activate).not.toHaveBeenCalled();
    view.rerender({ image: selected("current"), data, rotationReady: true });
    await flush();
    expect(view.computeNavigation.mock.calls.at(-1)![0]).toHaveLength(10);
    expect(
      view.result.current.getTarget(OBLIQUE_NAVIGATION_KEYS.RotateRight)
        ?.candidate.record.id
    ).toBe("next");
    expect(
      view.result.current.getCardinal(CardinalDirectionEnum.North)?.candidate
        .record.id
    ).toBe("next");
  });
  it("keeps pan FIFO running on a partial slice and never inserts disabled rotation ahead of it", async () => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "Date", "performance"],
    });
    const view = mount(false, undefined, {
      rank: async (queries) =>
        queries.map((query, index) => [
          selected(`${query.excludeImageId}-${index}`),
        ]),
    });
    view.busyRef.current = false;
    view.rerender({ image: selected("current"), data, rotationReady: false });
    await flush();
    const trace: string[] = [];
    const move = async (
      target: Parameters<
        Parameters<typeof view.result.current.requestTarget>[1]
      >[0]
    ) => {
      trace.push(target.originImageId);
      view.rerender({ image: target.candidate, data, rotationReady: false });
    };
    expect(
      await view.result.current.requestTarget(
        OBLIQUE_NAVIGATION_KEYS.RotateRight,
        move
      )
    ).toBe(false);
    const results = [
      view.result.current.requestTarget(OBLIQUE_NAVIGATION_KEYS.Right, move),
      view.result.current.requestTarget(OBLIQUE_NAVIGATION_KEYS.Right, move),
    ];
    for (let i = 0; i < 2; i++)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });
    expect(trace).toEqual(["current", "current-1"]);
    expect(await Promise.all(results)).toEqual([true, true]);
    expect(view.computeNavigation.mock.calls.at(-1)![0]).toHaveLength(4);
  });
  it("waits accepted rotation entries through a readiness loss and resumes them when the catalog is complete", async () => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "Date", "performance"],
    });
    const view = mount(false, undefined, { busy: true });
    await flush();
    const activate = vi.fn(async () => {}),
      done = view.result.current.requestTarget(
        OBLIQUE_NAVIGATION_KEYS.RotateRight,
        activate
      );
    view.rerender({ image: selected("current"), data, rotationReady: false });
    view.busyRef.current = false;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(activate).not.toHaveBeenCalled();
    view.rerender({ image: selected("current"), data, rotationReady: true });
    await flush();
    expect(activate).toHaveBeenCalledOnce();
    expect(await done).toBe(true);
  });
});

describe("navigation prewarm intent", () => {
  it("requires pointer dwell, cancels crossing, and never queues navigation", async () => {
    vi.useFakeTimers();
    const view = mount();
    await flush();
    const initialQueries = view.computeNavigation.mock.calls.length;
    act(() =>
      view.result.current.warmNavigation(
        OBLIQUE_NAVIGATION_KEYS.Right,
        true,
        "pointer"
      )
    );
    await act(async () => {
      vi.advanceTimersByTime(79);
    });
    expect(view.lookAhead).not.toHaveBeenCalled();
    act(() =>
      view.result.current.warmNavigation(
        OBLIQUE_NAVIGATION_KEYS.Right,
        false,
        "pointer"
      )
    );
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(view.lookAhead).not.toHaveBeenCalled();
    act(() =>
      view.result.current.warmNavigation(
        OBLIQUE_NAVIGATION_KEYS.Up,
        true,
        "pointer"
      )
    );
    await act(async () => {
      vi.advanceTimersByTime(80);
    });
    expect(view.lookAhead.mock.calls.at(-1)?.[1].key).toBe(
      OBLIQUE_NAVIGATION_KEYS.Up
    );
    expect(view.computeNavigation).toHaveBeenCalledTimes(initialQueries);
    view.unmount();
  });

  it("ranks queued action over pointer over immediate focus over remembered direction", async () => {
    vi.useFakeTimers();
    const view = mount(false, undefined, { busy: true });
    await flush();
    act(() =>
      view.result.current.rememberDirection(OBLIQUE_NAVIGATION_KEYS.Down)
    );
    act(() =>
      view.result.current.warmNavigation(
        OBLIQUE_NAVIGATION_KEYS.Left,
        true,
        "focus"
      )
    );
    expect(view.lookAhead.mock.calls.at(-1)?.[1].key).toBe(
      OBLIQUE_NAVIGATION_KEYS.Left
    );
    act(() =>
      view.result.current.warmNavigation(
        OBLIQUE_NAVIGATION_KEYS.Right,
        true,
        "pointer"
      )
    );
    await act(async () => {
      vi.advanceTimersByTime(80);
    });
    expect(view.lookAhead.mock.calls.at(-1)?.[1].key).toBe(
      OBLIQUE_NAVIGATION_KEYS.Right
    );
    const activate = vi.fn(async () => {});
    let queued!: Promise<boolean>;
    act(() => {
      queued = view.result.current.requestTarget(
        OBLIQUE_NAVIGATION_KEYS.Up,
        activate
      );
    });
    expect(view.lookAhead.mock.calls.at(-1)?.[1].key).toBe(
      OBLIQUE_NAVIGATION_KEYS.Up
    );
    expect(activate).not.toHaveBeenCalled();
    act(() => view.result.current.cancel());
    expect(await queued).toBe(false);
    // A fresh hover release restores focus, then remembered direction.
    act(() =>
      view.result.current.rememberDirection(OBLIQUE_NAVIGATION_KEYS.Down)
    );
    act(() =>
      view.result.current.warmNavigation(
        OBLIQUE_NAVIGATION_KEYS.Left,
        true,
        "focus"
      )
    );
    act(() =>
      view.result.current.warmNavigation(
        OBLIQUE_NAVIGATION_KEYS.Right,
        false,
        "pointer"
      )
    );
    expect(view.lookAhead.mock.calls.at(-1)?.[1].key).toBe(
      OBLIQUE_NAVIGATION_KEYS.Left
    );
    act(() =>
      view.result.current.warmNavigation(
        OBLIQUE_NAVIGATION_KEYS.Left,
        false,
        "focus"
      )
    );
    expect(view.lookAhead.mock.calls.at(-1)?.[1].key).toBe(
      OBLIQUE_NAVIGATION_KEYS.Down
    );
  });

  it("clears forecast on leaving without fallback and cancels pending dwell on unmount", async () => {
    vi.useFakeTimers();
    const view = mount();
    await flush();
    act(() =>
      view.result.current.warmNavigation(
        OBLIQUE_NAVIGATION_KEYS.Right,
        true,
        "focus"
      )
    );
    act(() =>
      view.result.current.warmNavigation(
        OBLIQUE_NAVIGATION_KEYS.Right,
        false,
        "focus"
      )
    );
    expect(view.lookAhead.mock.calls.at(-1)).toEqual([null]);
    act(() =>
      view.result.current.warmNavigation(
        OBLIQUE_NAVIGATION_KEYS.Up,
        true,
        "pointer"
      )
    );
    view.unmount();
    const before = view.lookAhead.mock.calls.length;
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(view.lookAhead).toHaveBeenCalledTimes(before);
  });

  it("does not warm disabled rotations on an incomplete catalog", async () => {
    vi.useFakeTimers();
    const view = mount();
    view.rerender({ image: selected("current"), data, rotationReady: false });
    await flush();
    act(() =>
      view.result.current.warmNavigation(
        OBLIQUE_NAVIGATION_KEYS.RotateRight,
        true,
        "focus"
      )
    );
    act(() =>
      view.result.current.warmNavigation(
        OBLIQUE_NAVIGATION_KEYS.RotateRight,
        true,
        "pointer"
      )
    );
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(view.lookAhead).not.toHaveBeenCalled();
  });
});

describe("bounded navigation forecast candidates", () => {
  const rank = async (queries: unknown[]) =>
    queries.map((_q, i) => [selected(`candidate-${i}`)]);

  it("immediately warms the remembered direction, and rotation group without an extra focus event", async () => {
    const groups = vi.fn();
    const view = mount(true, undefined, { onLookAheadGroup: groups, rank });
    await flush();
    expect(groups).not.toHaveBeenCalled();
    const searches = view.computeNavigation.mock.calls.length;
    act(() =>
      view.result.current.rememberDirection(OBLIQUE_NAVIGATION_KEYS.Up)
    );
    expect(
      groups.mock.calls
        .at(-1)![0]
        .map(
          (step: { candidate: NearestObliqueImageRecord }) =>
            step.candidate.record.id
        )
    ).toEqual(["candidate-2"]);
    act(() =>
      view.result.current.rememberDirection(OBLIQUE_NAVIGATION_KEYS.RotateRight)
    );
    const [rotated, groupKey] = groups.mock.calls.at(-1)!;
    expect(rotated[0].candidate.record.id).toBe("candidate-5");
    expect(
      rotated.every((step: { fitNextImage: boolean }) => !step.fitNextImage)
    ).toBe(true);
    expect(
      new Set(
        rotated.map(
          (step: { candidate: NearestObliqueImageRecord }) =>
            step.candidate.record.id
        )
      ).size
    ).toBe(rotated.length);
    expect(groupKey).toContain("rotation:");
    expect(view.computeNavigation).toHaveBeenCalledTimes(searches);
    act(() =>
      view.result.current.rememberDirection(OBLIQUE_NAVIGATION_KEYS.Up)
    );
    expect(groups.mock.calls.at(-1)![0]).toHaveLength(1);
    expect(groups.mock.calls.at(-1)![1]).not.toContain("rotation:");
    view.unmount();
  });

  it("refreshes same-image forecasts at display readiness and after a geometry generation", async () => {
    vi.useFakeTimers();
    const groups = vi.fn();
    const view = mount(true, undefined, { onLookAheadGroup: groups, rank });
    await flush();
    act(() =>
      view.result.current.rememberDirection(OBLIQUE_NAVIGATION_KEYS.RotateRight)
    );
    const original = groups.mock.calls.at(-1)!;
    const count = groups.mock.calls.length,
      searches = view.computeNavigation.mock.calls.length;
    act(() =>
      view.result.current.rememberDirection(OBLIQUE_NAVIGATION_KEYS.RotateRight)
    );
    expect(groups).toHaveBeenCalledTimes(count);
    act(() => view.result.current.refreshLookAhead());
    expect(groups).toHaveBeenCalledTimes(count + 1);
    expect(groups.mock.calls.at(-1)).toEqual(original);
    expect(view.computeNavigation).toHaveBeenCalledTimes(searches);
    act(() => {
      view.result.current.invalidate(false);
      view.result.current.refreshLookAhead();
    });
    expect(groups).toHaveBeenCalledTimes(count + 1);
    act(() => emit("moveend"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(80);
    });
    await flush();
    expect(groups).toHaveBeenCalledTimes(count + 2);
    expect(groups.mock.calls.at(-1)![1]).toBe(original[1]);
    expect(
      groups.mock.calls
        .at(-1)![0]
        .map(
          (step: { candidate: NearestObliqueImageRecord }) =>
            step.candidate.record.id
        )
    ).toEqual(
      original[0].map(
        (step: { candidate: NearestObliqueImageRecord }) =>
          step.candidate.record.id
      )
    );
    view.unmount();
  });

  it("remembers a cardinal rotation immediately and preserves its anchor through the orbit", async () => {
    const groups = vi.fn();
    const view = mount(true, undefined, { onLookAheadGroup: groups, rank });
    await flush();
    const initialTarget = view.targetRef.current!;
    act(() => view.result.current.rememberRotation(initialTarget));
    expect(groups).toHaveBeenCalledTimes(1);
    expect(
      groups.mock.calls[0][0].every(
        (step: { fitNextImage: boolean }) => !step.fitNextImage
      )
    ).toBe(true);
    const key = groups.mock.calls[0][1];
    act(() =>
      view.result.current.rememberRotation({
        ...initialTarget,
        longitude: initialTarget.longitude + 0.00001,
      })
    );
    expect(groups).toHaveBeenCalledTimes(1);
    act(() => view.result.current.refreshLookAhead());
    expect(groups.mock.calls.at(-1)![1]).toBe(key);
    view.unmount();
  });

  it("keeps queued/pointer/focus priority and cancels grouped work and pending dwell once", async () => {
    vi.useFakeTimers();
    const groups = vi.fn();
    const view = mount(true, undefined, {
      onLookAheadGroup: groups,
      rank,
      busy: true,
    });
    await flush();
    act(() =>
      view.result.current.rememberDirection(OBLIQUE_NAVIGATION_KEYS.RotateRight)
    );
    act(() =>
      view.result.current.warmNavigation(
        OBLIQUE_NAVIGATION_KEYS.Left,
        true,
        "focus"
      )
    );
    expect(groups.mock.calls.at(-1)![0][0].candidate.record.id).toBe(
      "candidate-0"
    );
    act(() =>
      view.result.current.warmNavigation(
        OBLIQUE_NAVIGATION_KEYS.Right,
        true,
        "pointer"
      )
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(80);
    });
    expect(groups.mock.calls.at(-1)![0][0].candidate.record.id).toBe(
      "candidate-1"
    );
    let queued!: Promise<boolean>;
    act(() => {
      queued = view.result.current.requestTarget(
        OBLIQUE_NAVIGATION_KEYS.Up,
        async () => {}
      );
    });
    expect(groups.mock.calls.at(-1)![0][0].candidate.record.id).toBe(
      "candidate-2"
    );
    act(() =>
      view.result.current.warmNavigation(
        OBLIQUE_NAVIGATION_KEYS.Down,
        true,
        "pointer"
      )
    );
    act(() => view.result.current.cancel());
    expect(await queued).toBe(false);
    expect(view.lookAhead).toHaveBeenLastCalledWith(null);
    const count = groups.mock.calls.length,
      releases = view.lookAhead.mock.calls.length;
    act(() => view.result.current.cancel());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(groups).toHaveBeenCalledTimes(count);
    expect(view.lookAhead).toHaveBeenCalledTimes(releases);
    view.unmount();
  });
});

describe("multi-series navigation through the spatial index and calibrated ranking", () => {
  const fixture = (reverse: boolean) => {
    const converter = getProj4Converter("EPSG:25832", "EPSG:4326");
    const location = (x: number, y: number) => {
      const [longitude, latitude] = converter.forward([
        370000 + x,
        5680000 + y,
      ]) as [number, number];
      return {
        longitude,
        latitude,
        heightMeters: 0,
        heightDatum: "dhhn2016" as const,
      };
    };
    const images: ObliqueMetadata["images"] = {};
    for (const [name, bearing, x, y] of [
      ["current", 0, 0, 0],
      ["left", 0, -100, 0],
      ["right", 0, 100, 0],
      ["up", 0, 0, 100],
      ["down", 0, 0, -100],
      ["east", 90, 0, 0],
      ["south", 180, 0, 0],
      ["west", 270, 0, 0],
    ] as const) {
      const heading = degToRad(bearing as Degrees);
      const direction = new Vector3(
        Math.sin(heading),
        Math.cos(heading),
        -1
      ).normalize();
      const up = new Vector3(0, 0, 1)
        .addScaledVector(direction, -direction.z)
        .normalize();
      const right = new Vector3().crossVectors(direction, up).normalize();
      images[name] = {
        cameraId: "camera",
        positionM: [
          370000 + x - Math.sin(heading) * 900,
          5680000 + y - Math.cos(heading) * 900,
          900,
        ],
        rotationMatrixRows: [
          right.toArray(),
          up.toArray(),
          direction.negate().toArray(),
        ] as [
          [number, number, number],
          [number, number, number],
          [number, number, number]
        ],
      };
    }
    const entries = ["2024", "2026"].map((id) => {
      const pixels = id === "2024" ? 1000 : 2000;
      const built = buildImageRecords(
        {
          schemaVersion: 1,
          seriesId: id,
          conventions: {
            ...TEST_INPHO_SERIES.sourceConventions,
            verticalDatum: "dhhn2016",
          },
          cameras: {
            camera: {
              widthPx: pixels,
              heightPx: pixels,
              focalLengthMm: 10,
              imageMmToPixelAffine: [
                [pixels / 10, 0, pixels / 2 - 0.5],
                [0, -pixels / 10, pixels / 2 - 0.5],
              ],
              mountRotationDeg: 270,
              view: "front",
            },
          },
          images: Object.fromEntries(
            Object.entries(images).map(([name, image]) => [
              name,
              id === "2024" && name !== "current"
                ? {
                    ...image,
                    positionM: [
                      image.positionM[0] + 25,
                      image.positionM[1] + 25,
                      image.positionM[2],
                    ],
                  }
                : image,
            ])
          ),
        },
        {
          ...TEST_INPHO_SERIES,
          id,
          captureNavigationTopology: id === "2024" ? "flight-strip" : undefined,
          heightDatum: "dhhn2016",
        }
      );
      return built;
    });
    if (reverse) entries.reverse();
    const catalog: ObliqueSelectionData = {
      imageRecords: new Map(),
      datasets: new Map(),
      centers: new Map(),
    };
    for (const built of entries) {
      catalog.datasets.set(built.dataset.id, built.dataset);
      for (const [id, record] of built.imageRecords) {
        catalog.imageRecords.set(id, record);
        catalog.centers.set(id, estimateGroundCenter(record, built.dataset));
      }
    }
    const current = catalog.imageRecords.get("2024::current")!;
    return {
      catalog,
      location,
      selected: {
        record: current,
        imageCenter: catalog.centers.get(current.id)!,
        distanceOnGround: 0,
        distanceToCamera: 900,
        coversTarget: true,
      },
    };
  };

  it.each([
    [false, false],
    [false, true],
    [true, false],
    [true, true],
  ])(
    "lets a geometrically closer 2026 photo win pan and rotation from 2024 (NG=%s, reverse=%s)",
    async (nextInterface, reverse) => {
      const { catalog, location, selected: image } = fixture(reverse);
      mocks.pose.mockImplementation((record) => record.pose);
      mocks.pan.mockImplementation((_record, _dataset, _target, movement) =>
        location(movement.right * 100, movement.forward * 100)
      );
      const index = createImageSelectionIndex(catalog);
      const rankedQueries: ObliqueViewQuery[] = [];
      const view = mount(nextInterface, location(0, 0), {
        data: catalog,
        image,
        rank: async (queries) =>
          queries.map((args) => {
            if (
              !args.target ||
              args.headingRad === undefined ||
              args.pitchRad === undefined
            )
              throw new Error(
                "Navigation must provide an explicit target and camera angles."
              );
            const query: ObliqueViewQuery = {
              ...args,
              target: args.target,
              headingRad: args.headingRad,
              pitchRad: args.pitchRad,
              selectionStrategy: "nearest-axis",
              enabledSeriesIds: [...catalog.datasets.keys()],
              maxDistanceMeters: 2000,
            };
            rankedQueries.push(query);
            return rankImagesForView(catalog, query, index.candidates(query));
          }),
      });
      await flush();
      for (const key of [
        OBLIQUE_NAVIGATION_KEYS.Left,
        OBLIQUE_NAVIGATION_KEYS.Right,
        OBLIQUE_NAVIGATION_KEYS.Up,
        OBLIQUE_NAVIGATION_KEYS.Down,
        OBLIQUE_NAVIGATION_KEYS.RotateLeft,
        OBLIQUE_NAVIGATION_KEYS.RotateRight,
      ]) {
        expect(
          view.result.current.getTarget(key)?.candidate.record.seriesId,
          key
        ).toBe("2026");
      }
      expect(
        rankedQueries
          .slice(0, 6)
          .every((query) => query.navigationSelection === undefined)
      ).toBe(true);
      for (const query of rankedQueries.slice(0, 4)) {
        expect(query.navigationOrigin).toEqual(location(0, 0));
        expect(query.navigationArrow).toBeDefined();
      }
    }
  );
});
