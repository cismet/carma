import { describe, expect, it } from "vitest";
import { scoreCalibratedCameraAxis } from "@carma-commons/math";
import { Matrix4, Vector3 } from "three";
import type { ObliqueImageRecord } from "../types";
import { scoreBestImage, scoreBestImageGeometry } from "./best-image";

const record = (id: string) => ({ id } as ObliqueImageRecord);
const projection = () =>
  new Matrix4().set(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0);
const geometry = (preferredDirection = new Vector3(0, 0, 1)) => ({
  projection: projection(),
  eye: new Vector3(0.5, 0.5, 0),
  preferredDirection,
});

describe("best-image angular ranking", () => {
  it.each([
    new Vector3(0, 0, 1),
    new Vector3(0.2, -0.1, 1),
    new Vector3(0, 0, -1),
  ])(
    "adapts the engine cosine into outward deviation and preserves full-sensor bottom-left UV",
    (direction) => {
      const target = new Vector3(0.75, 0.2, 2);
      const source = { ...geometry(direction), centerY: 0.7 };
      const canonical = scoreCalibratedCameraAxis(
        {
          sceneToImage: source.projection,
          eye: source.eye,
          direction: source.preferredDirection,
        },
        target
      );
      expect(canonical).not.toBeNull();
      expect(scoreBestImageGeometry(source, target)).toEqual({
        deviation: 1 - canonical!,
        imagePoint: { x: 0.375, y: 0.1 },
        centerY: 0.7,
      });
    }
  );

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
