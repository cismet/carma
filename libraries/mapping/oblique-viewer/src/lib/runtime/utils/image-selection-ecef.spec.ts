import { beforeEach, expect, it, vi } from "vitest";
import { cartographicToEcef } from "@carma-geo/proj";
import { degToRadNumeric } from "@carma-units";
const state = vi.hoisted(() => ({ geoid: vi.fn() }));
vi.mock("@carma-geo/proj", async () => ({
  ...(await vi.importActual<typeof import("@carma-geo/proj")>(
    "@carma-geo/proj"
  )),
  getGcg2016HeightAnomalies: state.geoid,
}));
import {
  physicalImageQueryTarget,
  preparePhysicalImageQuery,
} from "./image-selection-ecef";
beforeEach(() => state.geoid.mockReset().mockResolvedValue([45.5]));
it("converts DHHN H to physical ellipsoidal ECEF once and shares concurrent queries", async () => {
  const target = {
    longitude: 7.21,
    latitude: 51.27,
    heightMeters: 200,
    heightDatum: "dhhn2016" as const,
  };
  const [a, b] = await Promise.all([
    physicalImageQueryTarget(target),
    physicalImageQueryTarget({ ...target }),
  ]);
  expect(a).toBe(b);
  expect(state.geoid).toHaveBeenCalledOnce();
  expect(a.ecefMeters).toEqual(
    cartographicToEcef(
      degToRadNumeric(7.21),
      degToRadNumeric(51.27),
      245.5
    ).toArray()
  );
  expect(a.heightMeters).toBe(200);
});
it("accepts physical input and ellipsoidal height without a second geoid conversion", async () => {
  const direct = {
    longitude: 7,
    latitude: 51,
    ecefMeters: [1, 2, 3] as [number, number, number],
  };
  expect(await physicalImageQueryTarget(direct)).toBe(direct);
  expect(
    (
      await physicalImageQueryTarget({
        longitude: 7,
        latitude: 51,
        heightMeters: 200,
        heightDatum: "ellipsoidal",
      })
    ).ecefMeters
  ).toEqual(
    cartographicToEcef(degToRadNumeric(7), degToRadNumeric(51), 200).toArray()
  );
  expect(state.geoid).not.toHaveBeenCalled();
});
it("never interprets an absent or unknown height as ellipsoidal zero", async () => {
  for (const target of [
    { longitude: 7, latitude: 51 },
    {
      longitude: 7,
      latitude: 51,
      heightMeters: 200,
      heightDatum: "unknown" as const,
    },
  ])
    expect((await physicalImageQueryTarget(target)).ecefMeters).toBeUndefined();
  expect(state.geoid).not.toHaveBeenCalled();
});
it("leaves legacy queries untouched and explicitly uses the compact reference H plane", async () => {
  const q = {
    target: { longitude: 7.22, latitude: 51.28 },
    headingRad: 0,
    pitchRad: 0,
  };
  const data = {
    datasets: new Map([
      [
        "x",
        {
          id: "x",
          metadataFormat: "legacy-array-map",
          referenceGroundHeightMeters: 321,
        },
      ],
    ]),
    imageRecords: new Map(),
    centers: new Map(),
  } as any;
  expect(await preparePhysicalImageQuery(q, data)).toBe(q);
  data.datasets.get("x").metadataFormat = "oblique-compact-v2";
  const converted = await preparePhysicalImageQuery(q, data);
  expect(converted.target.heightMeters).toBe(321);
  expect(converted.target.heightDatum).toBe("dhhn2016");
  expect(converted.target.ecefMeters).toHaveLength(3);
});
it("rejects nonfinite geoid data instead of silently shifting to a planar rank", async () => {
  state.geoid.mockResolvedValue([NaN]);
  await expect(
    physicalImageQueryTarget({
      longitude: 7.23,
      latitude: 51.29,
      heightMeters: 22,
      heightDatum: "dhhn2016",
    })
  ).rejects.toThrow("finite geoid");
});
