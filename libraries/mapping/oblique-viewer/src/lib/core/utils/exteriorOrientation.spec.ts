import { describe, expect, it } from "vitest";
import { Vector3 } from "three";

import type { ExteriorOrientationDataArray } from "../types";
import { computePose } from "./exteriorOrientation";
import { mapExtOriArrToRecord } from "./imageRecord";
import { TEST_LEGACY_SERIES } from "./synthetic-series.test-fixture";

describe("computePose with synthetic legacy camera up mappings", () => {
  Object.entries(TEST_LEGACY_SERIES.cameraIdToUpVector).forEach(
    ([cameraId, mapping], index) => {
      it(`keeps the preview of camera ${cameraId} unrolled`, () => {
        // Construct orthonormal source axes independently of delivered imagery.
        const heading = (index * Math.PI) / 2;
        const direction = new Vector3(
          Math.sin(heading),
          Math.cos(heading),
          -1
        ).normalize();
        const up = new Vector3(0, 0, 1)
          .addScaledVector(direction, -direction.z)
          .normalize();
        const back = direction.clone().negate();
        const sourceUp = up.clone().multiplyScalar(mapping.negate ? 1 : -1);
        const row0 =
          mapping.rowIndex === 0
            ? sourceUp
            : new Vector3().crossVectors(sourceUp, back);
        const row1 =
          mapping.rowIndex === 1
            ? sourceUp
            : new Vector3().crossVectors(back, sourceUp);
        const served: ExteriorOrientationDataArray = [
          500000,
          5538630,
          1000,
          [row0.x, row0.y, row0.z],
          [row1.x, row1.y, row1.z],
          [back.x, back.y, back.z],
        ];
        const record = mapExtOriArrToRecord(
          `1_1_${cameraId}01`,
          served,
          TEST_LEGACY_SERIES.id
        );
        if (!record) throw new Error("Synthetic camera record is unreadable.");
        const pose = computePose(record, [9, 50], mapping);
        const [dx, dy, dz] = pose.direction;
        const [ux, uy, uz] = pose.up;
        expect(Math.abs(dx * ux + dy * uy + dz * uz)).toBeLessThan(0.1);
        expect(Math.abs(pose.rollDeg)).toBeLessThan(15);
      });
    }
  );
});
