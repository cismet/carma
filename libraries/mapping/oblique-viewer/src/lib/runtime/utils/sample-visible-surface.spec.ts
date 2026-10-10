import { afterEach, describe, expect, it, vi } from "vitest";
import { Matrix4, Plane, Vector3 } from "three";
import {
  mosaicSampleDensity,
  type MosaicPhoto,
} from "../../core/utils/photo-mosaic-plan";
import {
  planHoverPhotoView,
  sampleVisibleSurface,
  type VisibleSurfaceOptions,
  type VisibleSurfaceSamples,
} from "./sample-visible-surface";

const options = (width = 900, height = 700): VisibleSurfaceOptions => ({
  clip: new Matrix4(),
  pixels: { width, height },
  projectEye: () => [7, 51],
  intersectSurface: (ray) => ({
    point: ray.ray.at(1, new Vector3()),
    surface: "terrain",
  }),
});
const photo = (native = 10000): MosaicPhoto => ({
  id: "photo",
  width: native,
  height: native,
  projection: new Matrix4().set(
    0.1,
    0,
    0,
    0.5,
    0,
    0.1,
    0,
    0.5,
    0,
    0,
    1,
    0,
    0,
    0,
    0,
    1
  ),
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("shared visible surface sampling", () => {
  it("preserves the 9 by 7 center grid with derivatives exactly one actual buffer pixel apart", async () => {
    const sample = await sampleVisibleSurface(options());
    expect(sample?.samples).toHaveLength(63);
    expect(sample?.centerSampleIndex).toBe(31);
    expect(sample?.sampleScreen[31]).toEqual({ x: 450, y: 350 });
    const center = sample!.samples[31];
    expect(center.point.toArray()).toEqual([0, 0, 0]);
    expect(center.dx!.x - center.point.x).toBeCloseTo(2 / 900, 12);
    expect(center.dy!.y - center.point.y).toBeCloseTo(-2 / 700, 12);
    expect(sample?.sampleRadiusPixels).toBeCloseTo(
      Math.hypot(100, 100) / 2 + 1
    );
  });
  it("matches three real rays on a sloped plane with only 63 instead of 189 triangle casts", async () => {
    const plane = new Plane(new Vector3(-0.1, -0.2, 1).normalize(), 0);
    const actual = vi.fn(
      (ray: Parameters<VisibleSurfaceOptions["intersectSurface"]>[0]) => ({
        point: ray.ray.intersectPlane(plane, new Vector3())!,
        surface: "mesh" as const,
      })
    );
    const reference = (await sampleVisibleSurface({
      ...options(),
      intersectSurface: actual,
    }))!;
    expect(actual).toHaveBeenCalledTimes(189);
    actual.mockClear();
    const inputNormal = plane.normal.clone().multiplyScalar(4);
    const analytical = (await sampleVisibleSurface({
      ...options(),
      intersectSurface: (ray) => ({ ...actual(ray), normal: inputNormal }),
    }))!;
    expect(actual).toHaveBeenCalledTimes(63);
    expect(analytical.samples).toHaveLength(63);
    expect(analytical.sampleScreen).toEqual(reference.sampleScreen);
    expect(analytical.centerSampleIndex).toBe(reference.centerSampleIndex);
    analytical.samples.forEach((sample, index) => {
      for (const key of ["point", "dx", "dy"] as const)
        expect(
          sample[key]!.distanceTo(reference.samples[index][key]!)
        ).toBeLessThan(1e-10);
    });
    expect(inputNormal.length()).toBeCloseTo(4);
  });

  it.each([
    undefined,
    new Vector3(),
    new Vector3(NaN, 0, 1),
    new Vector3(Infinity, 0, 1),
    new Vector3(1, 0, 0),
    new Vector3(1, 0, 0.00001),
  ])(
    "uses real neighbour rays for a missing, invalid, parallel or out-of-range tangent normal %j",
    async (normal) => {
      const cast = vi.fn(
        (ray: Parameters<VisibleSurfaceOptions["intersectSurface"]>[0]) => ({
          point: ray.ray.at(1, new Vector3()),
          surface: "mesh" as const,
          normal,
        })
      );
      const result = await sampleVisibleSurface({
        ...options(),
        intersectSurface: cast,
      });
      expect(cast).toHaveBeenCalledTimes(189);
      expect(result?.samples).toHaveLength(63);
      expect(result!.samples[31].dx!.x).toBeCloseTo(2 / 900, 12);
    }
  );

  it.each([1, 2])(
    "yields and cancels between individual expensive casts after cast %s",
    async (slowCast) => {
      vi.useFakeTimers();
      let elapsed = 0;
      vi.spyOn(performance, "now").mockImplementation(() => elapsed);
      const controller = new AbortController();
      const cast = vi.fn(
        (ray: Parameters<VisibleSurfaceOptions["intersectSurface"]>[0]) => {
          if (cast.mock.calls.length === slowCast) elapsed += 5;
          return {
            point: ray.ray.at(1, new Vector3()),
            surface: "mesh" as const,
          };
        }
      );
      const pending = sampleVisibleSurface({
        ...options(),
        intersectSurface: cast,
        signal: controller.signal,
      });
      await Promise.resolve();
      await Promise.resolve();
      expect(cast).toHaveBeenCalledTimes(slowCast);
      expect(vi.getTimerCount()).toBe(1);
      controller.abort();
      await vi.runAllTimersAsync();
      expect(await pending).toBeNull();
      expect(cast).toHaveBeenCalledTimes(slowCast);
    }
  );

  it("omits silhouette crossings and depth discontinuities", async () => {
    let call = 0;
    const mixed = options();
    mixed.intersectSurface = (ray) => ({
      point: ray.ray.at(1, new Vector3()),
      surface: ++call % 3 === 2 ? "mesh" : "terrain",
    });
    expect((await sampleVisibleSurface(mixed))?.samples).toEqual([]);
    call = 0;
    const jump = options();
    jump.intersectSurface = (ray) => ({
      point: ray.ray.at(++call % 3 === 2 ? 100 : 1, new Vector3()),
      surface: "mesh",
    });
    expect((await sampleVisibleSurface(jump))?.samples).toEqual([]);
  });
  it("yields cooperatively and stops an obsolete request before its next cell", async () => {
    vi.useFakeTimers();
    let time = 0;
    vi.spyOn(performance, "now").mockImplementation(() => (time += 5));
    const controller = new AbortController();
    const cast = vi.fn(options().intersectSurface);
    const result = sampleVisibleSurface({
      ...options(),
      intersectSurface: cast,
      signal: controller.signal,
    });
    expect(vi.getTimerCount()).toBe(1);
    controller.abort();
    await vi.runAllTimersAsync();
    expect(await result).toBeNull();
    expect(cast).not.toHaveBeenCalled();
  });
});

describe("hover photo ROI and output-buffer density", () => {
  it("crops to the sampled sensor region and never requests more than its Jacobian or viewport budget", async () => {
    const input = { ...options(), photo: photo() };
    const result = (await planHoverPhotoView(input))!;
    expect(result).not.toBeNull();
    const crop = result.view.visible;
    expect(crop.x).toBeGreaterThan(3000);
    expect(crop.y).toBeGreaterThan(3000);
    expect(crop.x + crop.width).toBeLessThan(7000);
    expect(crop.y + crop.height).toBeLessThan(7000);
    const center = (await sampleVisibleSurface(input))!.samples[31];
    const required = mosaicSampleDensity(input.photo, center)!;
    expect(result.requiredDensity).toBeCloseTo(required);
    expect(result.view.density).toBeLessThanOrEqual(Math.min(1, required));
    expect(result.width * result.height).toBeLessThanOrEqual(900 * 700);
    expect(result.width / crop.width).toBeLessThanOrEqual(result.view.density);
    expect(result.height / crop.height).toBeLessThanOrEqual(
      result.view.density
    );
  });
  it("reuses shared samples without recasting and keeps abort local to the requesting photo", async () => {
    const sampled = await sampleVisibleSurface(options());
    let resolve!: (value: VisibleSurfaceSamples | null) => void;
    const surfaceSamples = new Promise<VisibleSurfaceSamples | null>((done) => {
      resolve = done;
    });
    const intersectSurface = vi.fn(() => {
      throw new Error("shared samples must avoid recasting");
    });
    const controller = new AbortController();
    const input = {
      ...options(),
      photo: photo(),
      surfaceSamples,
      intersectSurface,
    };
    const cancelled = planHoverPhotoView({
      ...input,
      signal: controller.signal,
    });
    const current = planHoverPhotoView(input);
    controller.abort();
    resolve(sampled);
    expect(await cancelled).toBeNull();
    expect(await current).not.toBeNull();
    expect(intersectSurface).not.toHaveBeenCalled();
    expect(
      await planHoverPhotoView({ ...input, isCurrent: () => false })
    ).toBeNull();
    expect(
      await planHoverPhotoView({
        ...input,
        surfaceSamples: Promise.resolve(null),
      })
    ).toBeNull();
    expect(intersectSurface).not.toHaveBeenCalled();
  });

  it("uses actual buffer resolution once and caps large outputs at eight million pixels", async () => {
    const first = (await planHoverPhotoView({
      ...options(500, 500),
      photo: photo(),
    }))!;
    const second = (await planHoverPhotoView({
      ...options(1000, 1000),
      photo: photo(),
    }))!;
    expect(second.requiredDensity).toBeCloseTo(first.requiredDensity * 2);
    expect(second.view.density / first.view.density).toBeCloseTo(2, 1);
    const large = (await planHoverPhotoView({
      ...options(8000, 8000),
      photo: photo(100000),
    }))!;
    expect(large.width * large.height).toBeLessThanOrEqual(8_000_000);
    expect(large.budgetLimited).toBe(true);
  });
  it("does not oversample native pixels when the source cannot meet one to one output sampling", async () => {
    const result = (await planHoverPhotoView({
      ...options(),
      photo: photo(100),
    }))!;
    expect(result.requiredDensity).toBeGreaterThan(1);
    expect(result.nativeLimited).toBe(true);
    expect(result.view.density).toBe(1);
    expect(result.width).toBeLessThanOrEqual(result.view.visible.width);
  });
  it("returns no detail view for absent, invalid, superseded or non-overlapping geometry", async () => {
    const controller = new AbortController();
    const pending = planHoverPhotoView({
      ...options(),
      photo: photo(),
      signal: controller.signal,
    });
    controller.abort();
    expect(await pending).toBeNull();

    expect(
      await planHoverPhotoView({
        ...options(),
        photo: photo(),
        intersectSurface: () => null,
      })
    ).toBeNull();
    expect(
      await planHoverPhotoView({
        ...options(),
        photo: photo(),
        clip: new Matrix4().makeScale(0, 0, 0),
      })
    ).toBeNull();
    expect(
      await planHoverPhotoView({
        ...options(),
        photo: photo(),
        isCurrent: () => false,
      })
    ).toBeNull();
    const outside = photo();
    outside.projection.setPosition(5, 5, 0);
    expect(
      await planHoverPhotoView({ ...options(), photo: outside })
    ).toBeNull();
  });
});
