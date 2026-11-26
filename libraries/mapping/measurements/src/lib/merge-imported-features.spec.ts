import { describe, expect, it } from "vitest";
import type { Feature } from "geojson";

import {
  applyImportedFeatures,
  sortImportedFeatures,
} from "./merge-imported-features";

const line = (id: string, x: number, title?: string): Feature => ({
  type: "Feature",
  id,
  geometry: {
    type: "LineString",
    coordinates: [
      [0, 0],
      [x, 0],
    ],
  },
  properties: title ? { customTitle: title } : {},
});

describe("imported measurement features", () => {
  it("adds unknown ids, skips equal ones and reports changed ones", () => {
    const local = [line("a", 1), line("b", 2)];
    const incoming = [line("a", 1), line("b", 3), line("c", 4)];

    const { additions, conflicts } = sortImportedFeatures(local, incoming);

    expect(additions.map((f) => f.id)).toEqual(["c"]);
    expect(conflicts.map((f) => f.id)).toEqual(["b"]);
  });

  it("counts a changed title as a change", () => {
    const { conflicts } = sortImportedFeatures(
      [line("a", 1)],
      [line("a", 1, "Zaun")]
    );

    expect(conflicts.map((f) => f.id)).toEqual(["a"]);
  });

  it("keeps the other local features when adding and replacing", () => {
    const local = [line("a", 1), line("b", 2)];

    const next = applyImportedFeatures(local, [line("b", 3), line("c", 4)]);

    expect(next.map((f) => f.id)).toEqual(["a", "b", "c"]);
    expect(next.find((f) => f.id === "b")).toEqual(line("b", 3));
  });
});
