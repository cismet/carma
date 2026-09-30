import { describe, expect, it } from "vitest";

import { WUPPERTAL_OBLIQUE_2024 } from "../config";
import type { ExteriorOrientationDataArray } from "../types";
import { computePose } from "./exteriorOrientation";
import { mapExtOriArrToRecord } from "./imageRecord";

/**
 * One image per camera from flight line 35, as served in
 * `exterior_orientations_utm32.noNadir.json`; the 170 one is the image that
 * showed up upside down. The previews are delivered with the
 * far side on top, so every camera's up mapping has to leave them nearly
 * unrolled.
 */
const SERVED: Record<string, ExteriorOrientationDataArray> = {
  "035_168_170003763": [
    375693.31106,
    5681491.0868,
    925.6723,
    [-0.617998724625, -0.414397810619, 0.668095824651],
    [0.558538775542, -0.829475598634, 0.002160436945],
    [0.553273903757, 0.374492571122, 0.744072107793],
  ],
  "035_160_171003771": [
    375165.66116,
    5681128.66801,
    931.25653,
    [-0.829021420218, -0.559216456904, -0.000662681846],
    [0.415820913125, -0.615648652093, -0.66938009037],
    [0.373920383274, -0.555205990155, 0.742919817658],
  ],
  "035_160_174003771": [
    375165.56471,
    5681128.81252,
    931.23247,
    [-0.616058311491, -0.414936143995, -0.669552203529],
    [0.56064689824, -0.828050604508, -0.002692929089],
    [-0.55330571327, -0.377041367466, 0.742760119341],
  ],
  "035_160_176003771": [
    375165.68938,
    5681128.9972,
    931.2691,
    [-0.829241275362, -0.558884260054, -0.002700203592],
    [0.414347042776, -0.618012957422, 0.668114146386],
    [-0.375067241142, 0.552909005464, 0.74405389341],
  ],
};

// the convergence turns direction and up alike, so the roll does not depend
// on the exact spot; this one is the camera of image 035_156_171003775
const LNG_LAT: [number, number] = [7.206788, 51.266197];

describe("computePose with the Wuppertal 2024 up mappings", () => {
  for (const [id, served] of Object.entries(SERVED)) {
    it(`keeps the preview of ${id} nearly unrolled`, () => {
      const record = mapExtOriArrToRecord(
        id,
        served,
        WUPPERTAL_OBLIQUE_2024.id
      );
      if (!record) throw new Error(`unreadable record ${id}`);
      const pose = computePose(
        record,
        LNG_LAT,
        WUPPERTAL_OBLIQUE_2024.cameraIdToUpVector[record.cameraId]
      );
      // an up along the view direction leaves the roll to rounding noise,
      // which can land near zero by chance
      const [dx, dy, dz] = pose.direction;
      const [ux, uy, uz] = pose.up;
      expect(Math.abs(dx * ux + dy * uy + dz * uz)).toBeLessThan(0.1);
      expect(Math.abs(pose.rollDeg)).toBeLessThan(15);
    });
  }
});
