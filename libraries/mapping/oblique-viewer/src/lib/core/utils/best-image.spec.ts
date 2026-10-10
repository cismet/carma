import { describe, expect, it } from "vitest";
import { Matrix4, Vector3 } from "three";
import type { ObliqueImageRecord } from "../types";
import {
  rankBestImages,
  scoreBestImage,
  scoreBestImageGeometry,
} from "./best-image";

const record = (id: string) => ({ id } as ObliqueImageRecord);
const projection = () =>
  new Matrix4().set(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0);
const geometry = (preferredDirection = new Vector3(0, 0, 1)) => ({
  projection: projection(),
  eye: new Vector3(0.5, 0.5, 0),
  preferredDirection,
});

describe("best-image angular ranking", () => {
  it("ranks by least angular deviation and uses active ID only for exact ties", () => {
    const target = new Vector3(0.5, 0.5, 2);
    const ranks = rankBestImages(
      [
        { record: record("z-match"), geometry: geometry() },
        {
          record: record("a-close"),
          geometry: geometry(new Vector3(0.1, 0, 1)),
        },
        { record: record("b-match"), geometry: geometry() },
      ],
      target,
      "b-match"
    );
    expect(ranks.map(({ record: item }) => item.id)).toEqual([
      "b-match",
      "z-match",
      "a-close",
    ]);
    expect(ranks[0].deviation).toBe(0);
  });

  it("rejects points outside the sensor, behind the projector, and degenerate rays", () => {
    const target = new Vector3(0.5, 0.5, 2);
    expect(
      scoreBestImage(record("off-sensor"), geometry(), new Vector3(3, 0.5, 2))
    ).toBeNull();
    expect(
      scoreBestImage(
        record("behind"),
        {
          ...geometry(),
          projection: new Matrix4().set(
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
            0,
            0,
            0,
            0,
            -1,
            0
          ),
        },
        target
      )
    ).toBeNull();
    expect(
      scoreBestImage(record("zero-ray"), geometry(), geometry().eye)
    ).toBeNull();
  });

  it("exposes the same pure geometry score independently of record metadata", () => {
    const target = new Vector3(0.5, 0.5, 2);
    const geometryScore = scoreBestImageGeometry(geometry(), target);
    const recordScore = scoreBestImage(record("candidate"), geometry(), target);
    expect(geometryScore).toEqual({
      deviation: 0,
      imagePoint: { x: 0.25, y: 0.25 },
    });
    expect(recordScore).toEqual({
      record: record("candidate"),
      ...geometryScore,
    });
  });
});
