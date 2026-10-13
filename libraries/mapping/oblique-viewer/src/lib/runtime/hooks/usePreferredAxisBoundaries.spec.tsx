import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Matrix4, Vector3 } from "three";
import type { Map as MaplibreMap } from "maplibre-gl";
import type { Degrees, Radians } from "@carma-units";
import type {
  BestImageAreaCache,
  MapStyleAxisBoundaryOverlay,
  SharedThreeSceneFrame,
} from "@carma-mapping/engines/maplibre";
import type {
  ObliqueImageRecord,
  ObliqueSelectionData,
} from "../../core/types";
import type {
  PhotoAxisPicker,
  PreparedBestImageField,
} from "../utils/photo-axis-picker";
import { usePreferredAxisBoundaries } from "./usePreferredAxisBoundaries";

type Options = Parameters<typeof usePreferredAxisBoundaries>[0];
const mocks = vi.hoisted(() => ({
  callback: undefined as undefined | ((frame: SharedThreeSceneFrame) => void),
  publish: vi.fn(),
  release: vi.fn(),
  project: vi.fn(),
}));
vi.mock("@carma-mapping/engines/maplibre", () => ({
  acquireSharedThreeScene: () => ({
    release: mocks.release,
    layer: {
      setMapStyleAxisBoundaries: mocks.publish,
      projectLngLatToScene: mocks.project,
      addBeforeRenderCallback: (callback: typeof mocks.callback) => {
        mocks.callback = callback;
        return () => {
          mocks.callback = undefined;
        };
      },
    },
  }),
}));
const record = (id: string) => ({ id } as ObliqueImageRecord);
const site = (id: string) => ({
  id,
  sceneToImage: new Matrix4(),
  eye: new Vector3(0, 0, 10),
  direction: new Vector3(0, 0, -1),
});
const frame = (currentToReference = new Matrix4()) =>
  ({
    localFrame: {
      referenceLngLat: [7, 51],
      sceneFromLocalReference: new Matrix4(),
      currentToReference,
    },
  } as unknown as SharedThreeSceneFrame);
const emitFrame = (value = frame()) => act(() => mocks.callback?.(value));
const flush = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(100);
  });
const latest = () =>
  mocks.publish.mock.calls.filter(([, overlay]) => overlay).at(-1)?.[1] as
    | MapStyleAxisBoundaryOverlay
    | undefined;
const fixture = () => {
  let pitch = 45;
  const events = new Map<string, () => void>();
  const map = {
    triggerRepaint: vi.fn(),
    getPitch: () => pitch,
    on: vi.fn((name: string, fn: () => void) => {
      events.set(name, fn);
    }),
    off: vi.fn((name: string) => {
      events.delete(name);
    }),
  } as unknown as MaplibreMap;
  const images = [record("a-current"), record("c-current")];
  let field = {
    sites: [site("a-current"), site("b-other-heading"), site("c-current")],
    geometryRevision: 1,
    axisRevision: 1,
  };
  const readField = vi.fn(() => field);
  const dispose = vi.fn();
  const cache = { readField, dispose } as unknown as BestImageAreaCache;
  const prepared: PreparedBestImageField = {
    entries: [],
    sceneToMetric: new Matrix4().makeTranslation(4, 5, 6),
    referenceToMetric: new Matrix4().makeTranslation(4, 5, 6),
    cache,
    eligibleIds: new Set(images.map((value) => value.id)),
  };
  const prepare = vi.fn<
    Parameters<PhotoAxisPicker["prepareBestField"]>,
    ReturnType<PhotoAxisPicker["prepareBestField"]>
  >(async () => prepared);
  const picker = { prepareBestField: prepare } as unknown as PhotoAxisPicker;
  const options: Options = {
    map,
    enabled: true,
    groupKey: "west",
    catalogRevision: 1,
    recordsRevision: 1,
    readRecords: () => images,
    preferredPitchDeg: null,
    bestImagePicker: picker,
    readFocusTarget: () => ({ longitude: 7, latitude: 51, heightMeters: 120 }),
  };
  const view = renderHook(
    (props: Partial<Options>) =>
      usePreferredAxisBoundaries({ ...options, ...props }),
    { initialProps: {} as Partial<Options> }
  );
  return {
    ...view,
    options,
    map,
    images,
    field,
    prepared,
    cache,
    dispose,
    prepare,
    events,
    setPitch: (value: number) => {
      pitch = value;
    },
    changeField: () => {
      field = {
        ...field,
        sites: [...field.sites, site("d-later")],
        geometryRevision: 2,
        axisRevision: 2,
      };
    },
  };
};

describe("shared best-image boundary display", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mocks.project.mockReturnValue(new Vector3(1, 2, 3));
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("borrows the complete canonical index and keeps current-direction eligibility separate", async () => {
    const f = fixture();
    emitFrame();
    await flush();
    expect(f.prepare).toHaveBeenCalledOnce();
    expect(f.prepare).toHaveBeenCalledWith(
      f.images,
      expect.objectContaining({
        preferredPitchDeg: 45,
        isCurrent: expect.any(Function),
      })
    );
    expect(latest()?.candidateCache).toBe(f.cache);
    expect(latest()?.sources).toBe(f.field.sites);
    expect(latest()?.sources.map((value) => value.id)).toEqual([
      "a-current",
      "b-other-heading",
      "c-current",
    ]);
    expect([...latest()!.eligibleIds!]).toEqual(["a-current", "c-current"]);
    f.unmount();
    expect(f.dispose).not.toHaveBeenCalled();
    expect(mocks.release).toHaveBeenCalledOnce();
    expect(mocks.publish.mock.calls.at(-1)?.[1]).toBeNull();
  });

  it("delegates series-reference and slider changes to the picker without its own camera calculation", async () => {
    const f = fixture();
    f.rerender({ seriesDirection: true });
    emitFrame();
    await flush();
    expect(f.prepare.mock.calls[0][1]?.preferredPitchDeg).toBeUndefined();
    f.rerender({ seriesDirection: true, preferredPitchDeg: 50 as Degrees });
    emitFrame();
    await flush();
    expect(f.prepare).toHaveBeenCalledTimes(2);
    expect(f.prepare.mock.calls[1][1]?.preferredPitchDeg).toBe(50);
  });

  it("refreshes in-place series-reference totals without catalog identity changes", async () => {
    const f = fixture();
    const totals = {
      opticalPitchSumRad: 0.8 as Radians,
      headingSinSum: 0.3,
      headingCosSum: 0.7,
      imageCount: 1,
    };
    const data = {
      obliqueReferenceByDirectionBySeries: new Map([
        ["series", new Map([["N", totals]])],
      ]),
    } as unknown as ObliqueSelectionData;
    f.rerender({ seriesDirection: true, selectionData: data });
    emitFrame();
    await flush();
    totals.headingSinSum = 0.6;
    totals.imageCount = 2;
    emitFrame();
    await flush();
    expect(f.prepare).toHaveBeenCalledTimes(2);
    expect(latest()?.candidateCache).toBe(f.cache);
  });

  it("contains a rejected shared preparation and can recover on a newer catalog", async () => {
    const f = fixture();
    f.prepare.mockRejectedValueOnce(new Error("stale catalog"));
    emitFrame();
    await flush();
    expect(latest()).toBeUndefined();
    f.rerender({ catalogRevision: 2 });
    emitFrame();
    await flush();
    expect(latest()?.candidateCache).toBe(f.cache);
  });

  it("uses only the canonical admitted sites, including when the picker excludes nadir or incomplete sources", async () => {
    const f = fixture();
    f.field.sites = [site("a-current")];
    emitFrame();
    await flush();
    expect(latest()?.sources.map((value) => value.id)).toEqual(["a-current"]);
  });

  it("keeps reference placement and focus stable across scene refits without rebuilding geometry", async () => {
    const f = fixture();
    emitFrame(frame(new Matrix4().makeTranslation(10, 0, 0)));
    await flush();
    const published = latest()!;
    expect(published.referenceToMetric.elements).toEqual(
      new Matrix4().makeTranslation(-6, 5, 6).elements
    );
    emitFrame(frame(new Matrix4().makeTranslation(10, 0, 0)));
    expect(published.readFocus?.()?.toArray()).toEqual([5, 7, 9]);
    mocks.project.mockReturnValue(new Vector3(-9, 2, 3));
    emitFrame(frame(new Matrix4().makeTranslation(20, 0, 0)));
    expect(published.readFocus?.()?.toArray()).toEqual([5, 7, 9]);
    expect(f.prepare).toHaveBeenCalledOnce();
    expect(mocks.publish.mock.calls.filter(([, v]) => v)).toHaveLength(1);
  });

  it("publishes a later shared table revision without configuring another spatial index", async () => {
    const f = fixture();
    emitFrame();
    await flush();
    f.changeField();
    emitFrame();
    expect(latest()?.sources.map((value) => value.id)).toContain("d-later");
    expect(latest()?.candidateCache).toBe(f.cache);
    expect(f.prepare).toHaveBeenCalledOnce();
  });

  it("refreshes the camera's default pitch only on settled movement", async () => {
    const f = fixture();
    emitFrame();
    await flush();
    f.setPitch(62);
    emitFrame();
    expect(f.prepare).toHaveBeenCalledOnce();
    act(() => f.events.get("moveend")?.());
    await flush();
    expect(f.prepare.mock.calls.at(-1)?.[1]?.preferredPitchDeg).toBe(62);
  });

  it("rejects an in-flight preparation after a reference-frame change and publishes only its successor", async () => {
    const f = fixture();
    let resolve!: (value: PreparedBestImageField) => void;
    f.prepare.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );
    emitFrame();
    await flush();
    const stale = f.prepare.mock.calls[0][1]!.isCurrent!;
    emitFrame(frame(new Matrix4().makeTranslation(10, 0, 0)));
    expect(stale()).toBe(false);
    await act(async () => {
      resolve(f.prepared);
      await Promise.resolve();
    });
    expect(latest()).toBeUndefined();
    await flush();
    expect(f.prepare).toHaveBeenCalledTimes(2);
    expect(latest()?.candidateCache).toBe(f.cache);
  });

  it("does not start an independent resolver when no shared picker exists", async () => {
    const f = fixture();
    f.rerender({ bestImagePicker: undefined });
    await flush();
    expect(f.prepare).not.toHaveBeenCalled();
    expect(latest()).toBeUndefined();
  });
});
