import { describe, expect, it } from "vitest";

import { resolvePickedIdCandidates } from "./cesium-picked-id-candidates";

describe("resolvePickedIdCandidates", () => {
  it("reads the object id, the polygon group id inside it and the primitive id", () => {
    expect(resolvePickedIdCandidates({ id: "line-1" })).toEqual(["line-1"]);
    expect(
      resolvePickedIdCandidates({
        id: { polygonGroupId: "fill-1" },
        primitive: { id: "primitive-1" },
      })
    ).toEqual(["fill-1", "primitive-1"]);
  });

  it("drops everything that is not a string id", () => {
    expect(
      resolvePickedIdCandidates({ id: 7, primitive: { id: { a: 1 } } })
    ).toEqual([]);
  });

  it("gives nothing for a miss", () => {
    expect(resolvePickedIdCandidates(undefined)).toEqual([]);
    expect(resolvePickedIdCandidates(null)).toEqual([]);
    expect(resolvePickedIdCandidates("id")).toEqual([]);
  });
});
