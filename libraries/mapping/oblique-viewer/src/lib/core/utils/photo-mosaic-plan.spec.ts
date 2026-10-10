import { describe, expect, it } from "vitest";
import { Matrix4, Vector3 } from "three";
import {
  mosaicSampleDensity,
  planPhotoMosaic,
  planPhotoMosaicCooperatively,
  type MosaicPhoto,
  type MosaicSurfaceSample,
} from "./photo-mosaic-plan";

const photo = (
  id = "photo",
  projection = new Matrix4(),
  width = 1000,
  height = 1000
): MosaicPhoto => ({ id, projection, width, height });
const sample = (
  x = 0.5,
  y = 0.3,
  stepX = 0.002,
  stepY = 0.002
): MosaicSurfaceSample => ({
  point: new Vector3(x, y, 0),
  dx: new Vector3(x + stepX, y, 0),
  dy: new Vector3(x, y + stepY, 0),
});
const plan = (
  photos: MosaicPhoto[],
  samples: MosaicSurfaceSample[],
  centerSampleIndex = 0,
  sampleRadiusPixels = 2
) =>
  planPhotoMosaic({ photos, samples, centerSampleIndex, sampleRadiusPixels });

describe("photo mosaic output-buffer sampling", () => {
  it("uses the smallest singular value rather than area or the longest axis", () => {
    expect(
      mosaicSampleDensity(photo(), sample(0.5, 0.3, 0.004, 0.0005))
    ).toBeCloseTo(2);
    // J = [[2,3],[0,-1]]: non-orthogonal screen directions need the SVD.
    const point = new Vector3(0.5, 0.3, 0);
    const sheared = {
      point,
      dx: point.clone().add(new Vector3(0.002, 0, 0)),
      dy: point.clone().add(new Vector3(0.003, 0.001, 0)),
    };
    expect(mosaicSampleDensity(photo(), sheared)).toBeCloseTo(
      1 / Math.sqrt((14 - Math.sqrt(180)) / 2)
    );
  });

  it("accounts for output resolution exactly once through neighbour spacing", () => {
    const cssResolution = mosaicSampleDensity(photo(), sample())!;
    const doubleBufferResolution = mosaicSampleDensity(
      photo(),
      sample(0.5, 0.3, 0.001, 0.001)
    )!;
    expect(cssResolution).toBeCloseTo(0.5);
    expect(doubleBufferResolution).toBeCloseTo(2 * cssResolution);
  });

  it("uses the analytic projective derivative at the sample, not a finite UV chord", () => {
    const projection = new Matrix4().set(
      1,
      0,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      1,
      0,
      1,
      0,
      0,
      1
    );
    const p = photo("projective", projection, 100, 100);
    expect(mosaicSampleDensity(p, sample(1, 0, 0.04, 0.02))).toBeCloseTo(1);
  });

  it("reports native-limited quality instead of claiming one-to-one beyond native data", () => {
    const [entry] = plan([photo()], [sample(0.5, 0.3, 0.00025, 0.00025)]);
    expect(entry.requiredDensity).toBeCloseTo(4);
    expect(entry.view.density).toBe(1);
    expect(entry.nativeLimited).toBe(true);
    const [ordinary] = plan([photo()], [sample()]);
    expect(ordinary.requiredDensity).toBeCloseTo(0.5);
    expect(ordinary.view.density).toBeCloseTo(0.5);
    expect(ordinary.nativeLimited).toBe(false);
  });

  it("keeps per-cell density so one foreshortened facade does not upsample unrelated patches", () => {
    const [entry] = plan(
      [photo()],
      [sample(0.25, 0.3, 0.004, 0.002), sample(0.75, 0.3, 0.0001, 0.001)]
    );
    expect(entry.view.density).toBe(1);
    expect(entry.requiredDensity).toBeCloseTo(10);
    expect(entry.patches[0].density).toBeCloseTo(0.5);
    expect(entry.patches[0].requiredDensity).toBeCloseTo(0.5);
    expect(entry.patches[1].density).toBe(1);
    expect(entry.patches[1].requiredDensity).toBeCloseTo(10);
  });

  it("omits unknown, singular and horizon-crossing cells without a whole-photo fallback", () => {
    const s = sample();
    expect(mosaicSampleDensity(photo(), { point: s.point })).toBeNull();
    expect(plan([photo()], [{ point: s.point }])).toEqual([]);
    expect(plan([photo()], [{ ...s, dy: s.dx }])).toEqual([]);
    const horizon = photo(
      "horizon",
      new Matrix4().set(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0)
    );
    expect(plan([horizon], [sample(0.5, 0.1, 0.1, 0.01)], 0, 6)).toEqual([]);
    expect(plan([photo()], [sample()], 0, NaN)).toEqual([]);
  });

  it("keeps valid sample coverage while leaving unreliable cells unassigned", () => {
    const result = plan(
      [photo()],
      [sample(), { point: new Vector3(0.8, 0.8, 0) }]
    );
    expect(result[0].coverage).toEqual([0]);
    expect(result[0].view.visible.width).toBeLessThan(20);
  });

  it("converts bottom-left UV to a clipped top-left ROI with derivative-sized cell guards", () => {
    const [entry] = plan(
      [photo("rect", new Matrix4(), 100, 200)],
      [sample(0.5, 0.25, 0.02, 0.005)]
    );
    expect(entry.view.visible).toEqual({ x: 45, y: 147, width: 10, height: 6 });
    const [edge] = plan(
      [photo("rect", new Matrix4(), 100, 200)],
      [sample(0.01, 0.99, 0.02, 0.005)]
    );
    expect(edge.view.visible.x).toBe(0);
    expect(edge.view.visible.y).toBe(0);
    expect(edge.view.visible.width).toBeLessThan(10);
    expect(edge.view.visible.height).toBeLessThan(10);
  });
});

describe("photo mosaic coverage ordering", () => {
  const physicalPhoto = (
    id: string,
    eyeX: number,
    preferredDirection = new Vector3(0, 0, -1)
  ): MosaicPhoto => {
    const result = photo(id);
    return {
      ...result,
      geometry: {
        projection: result.projection,
        eye: new Vector3(eyeX, 0.3, 1),
        preferredDirection,
      },
    };
  };

  it("assigns each covered cell to its own angular winner across series", () => {
    const result = plan(
      [physicalPhoto("2024:left", 0.2), physicalPhoto("2026:right", 0.8)],
      [sample(0.2), sample(0.8)],
      0
    );
    expect(new Map(result.map((entry) => [entry.id, entry.coverage]))).toEqual(
      new Map([
        ["2024:left", [0]],
        ["2026:right", [1]],
      ])
    );
  });

  it("uses a changed preferred ground-ray pitch for cell ownership", () => {
    const samples = [sample(0.2)];
    const left = physicalPhoto("left", 0.2),
      right = physicalPhoto("right", 0.8);
    expect(plan([left, right], samples)[0].id).toBe("left");
    const pitched = new Vector3(-0.6, 0, -1).normalize();
    expect(
      plan(
        [
          physicalPhoto("left", 0.2, pitched),
          physicalPhoto("right", 0.8, pitched),
        ],
        samples
      )[0].id
    ).toBe("right");
  });

  it("resolves equal angular cell scores by ID independent of candidate order", () => {
    const a = physicalPhoto("a", 0.5),
      b = physicalPhoto("b", 0.5);
    for (const candidates of [
      [a, b],
      [b, a],
    ])
      expect(plan(candidates, [sample()]).map((entry) => entry.id)).toEqual([
        "a",
      ]);
  });

  it("requests owned patches without filling the union bounding box between them", () => {
    const result = plan(
      [photo("top", new Matrix4().makeScale(2, 1, 1)), photo("under")],
      [sample(0.25), sample(0.6), sample(0.9)],
      0
    );
    expect(result.map((entry) => entry.id)).toEqual(["top", "under"]);
    const under = result[1];
    expect(under.coverage).toEqual([1, 2]);
    expect(under.patches).toHaveLength(2);
    expect(under.view.visible.width).toBeGreaterThan(300);
    expect(under.patches.every((patch) => patch.width < 20)).toBe(true);
    expect(
      under.patches.some(
        (patch) => patch.x <= 750 && patch.x + patch.width >= 750
      )
    ).toBe(false);
    expect(
      under.patches.some(
        (patch) => patch.x <= 250 && patch.x + patch.width >= 250
      )
    ).toBe(false);
    expect(
      plan([photo("first"), photo("fully-hidden")], [sample()]).map(
        (entry) => entry.id
      )
    ).toEqual(["first"]);
  });

  it("gives the closest preferred viewport-center photo the highest priority", () => {
    const samples = [sample(0.2, 0.3), sample(0.8, 0.3), sample(1.2, 0.3)];
    const broad = photo("broad", new Matrix4().makeScale(0.5, 1, 1));
    const centered = photo(
      "centered",
      new Matrix4().makeTranslation(0.3, 0, 0)
    );
    const entries = plan([broad, centered], samples);
    expect(entries.map((entry) => entry.id)).toEqual(["centered", "broad"]);
    expect(entries[0].coverage).toEqual([0]);
    expect(entries[1].coverage).toEqual([1, 2]);
    expect(entries[0].priority).toBeGreaterThan(entries[1].priority);
  });

  it("obeys the configurable bottom-up center preference", () => {
    const low = photo("low");
    const high = photo("high", new Matrix4().makeTranslation(0, 0.4, 0));
    const options = {
      photos: [low, high],
      samples: [sample()],
      centerSampleIndex: 0,
      sampleRadiusPixels: 2,
    };
    expect(planPhotoMosaic({ ...options, centerY: 0.3 })[0].id).toBe("low");
    expect(planPhotoMosaic({ ...options, centerY: 0.7 })[0].id).toBe("high");
  });

  it("covers remaining samples inside-out, omits redundant photos and has no two-photo cap", () => {
    const samples = [sample(0.25), sample(1.25), sample(2.25), sample(3.25)];
    const photos = Array.from({ length: 4 }, (_, i) =>
      photo(String(i), new Matrix4().makeTranslation(-i, 0, 0))
    );
    const entries = plan([...photos, photo("duplicate-coverage")], samples, -1);
    expect(entries.map((entry) => entry.id)).toEqual(["0", "1", "2", "3"]);
    expect(entries.flatMap((entry) => entry.coverage)).toEqual([0, 1, 2, 3]);
    expect(entries.map((entry) => entry.priority)).toEqual([5, 4, 3, 2]);
  });

  it("uses the nearest projected hit when the viewport center sample is missing", () => {
    const entries = plan(
      [photo("narrow"), photo("broad", new Matrix4().makeScale(0.4, 1, 1))],
      [sample(0.2), sample(1.2), sample(2.2)],
      -1
    );
    expect(entries.map((entry) => entry.id)).toEqual(["broad", "narrow"]);
    expect(entries[0].coverage).toEqual([1, 2]);
    expect(entries[1].coverage).toEqual([0]);
  });

  it("does not let global center order steal a cell from its closer source", () => {
    const samples = [sample(0.25), sample(0.8), sample(1.2), sample(1.6)];
    const near = photo("near", new Matrix4().makeTranslation(0.25, 0, 0));
    const middle = photo("middle");
    const far = photo("far", new Matrix4().makeScale(0.4, 1, 1));
    // The far photo's preferred ray is closer for the second cell even though
    // its viewport-center rank is lower than the middle photo's rank.
    for (const photos of [
      [far, near, middle],
      [middle, near, far],
      [near, far, middle],
    ]) {
      const entries = plan(photos, samples);
      expect(
        entries.map(({ id, coverage, priority }) => ({
          id,
          coverage,
          priority,
        }))
      ).toEqual([
        { id: "near", coverage: [0], priority: 3 },
        { id: "far", coverage: [1, 2, 3], priority: 2 },
      ]);
    }
  });

  it("ranks against the real center even when that point lies outside a sensor", () => {
    const samples = [sample(2), sample(0.5), sample(1.2)];
    const farther = photo("farther");
    const nearer = photo("nearer", new Matrix4().makeTranslation(-0.5, 0, 0));
    for (const photos of [
      [farther, nearer],
      [nearer, farther],
    ]) {
      const entries = plan(photos, samples);
      expect(entries.map(({ id, coverage }) => ({ id, coverage }))).toEqual([
        { id: "nearer", coverage: [2] },
        { id: "farther", coverage: [1] },
      ]);
    }
  });

  it.each([0, -1])(
    "breaks equal distances by ID and never requests fully hidden photos (center=%s)",
    (center) => {
      for (const photos of [
        [photo("b"), photo("a")],
        [photo("a"), photo("b")],
      ]) {
        const entries = plan(photos, [sample(0.5)], center);
        expect(entries.map(({ id }) => id)).toEqual(["a"]);
        expect(entries[0].patches).toHaveLength(1);
      }
    }
  );

  it("rejects invalid/behind-camera/outside data and does not mutate matrices or points", () => {
    const p = photo(),
      s = sample();
    const before = JSON.stringify({ p, s });
    const behind = photo("behind", new Matrix4().multiplyScalar(-1));
    const invalid = photo("invalid", new Matrix4(), NaN);
    const entries = plan([behind, invalid, p, p], [s, sample(3, 3)]);
    expect(entries).toHaveLength(1);
    expect(entries[0].coverage).toEqual([0]);
    expect(JSON.stringify({ p, s })).toBe(before);
  });
});

describe("cooperative mosaic planning", () => {
  it("preserves the synchronous ownership and image-demand result", async () => {
    const options = {
      photos: [
        photo("left"),
        photo("right", new Matrix4().makeTranslation(-0.5, 0, 0)),
      ],
      samples: [sample(0.2), sample(0.8), sample(1.2)],
      centerSampleIndex: 0,
      sampleRadiusPixels: 2,
    };
    expect(await planPhotoMosaicCooperatively(options)).toEqual(
      planPhotoMosaic(options)
    );
  });

  it("abandons superseded wide pools before publishing a partial field", async () => {
    let checks = 0;
    const options = {
      photos: Array.from({ length: 1000 }, (_, index) => photo(String(index))),
      samples: [sample()],
      centerSampleIndex: 0,
      sampleRadiusPixels: 2,
    };
    expect(
      await planPhotoMosaicCooperatively(options, () => ++checks < 4)
    ).toEqual([]);
    expect(checks).toBe(4);
  });
});
