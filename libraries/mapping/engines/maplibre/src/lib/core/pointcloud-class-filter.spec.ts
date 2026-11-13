import { describe, expect, it } from "vitest";

import { buildPointCloudClassMask } from "./pointcloud-class-filter";

const shownClasses = (mask: Uint8Array | null) =>
  mask ? [...mask.keys()].filter((classId) => mask[classId] === 1) : null;

describe("buildPointCloudClassMask", () => {
  it("keeps every class without an expression", () => {
    expect(buildPointCloudClassMask(null, "class")).toBeNull();
    expect(buildPointCloudClassMask(undefined, "class")).toBeNull();
  });

  it("evaluates the expression the filter buttons build in or mode", () => {
    const expression = [
      "any",
      ["in", ["get", "class"], ["literal", [6, 8]]],
      ["==", ["get", "class"], 12],
    ];
    expect(shownClasses(buildPointCloudClassMask(expression, "class"))).toEqual(
      [6, 8, 12]
    );
  });

  it("hides every class for the buttons' hide-all expression", () => {
    const expression = ["==", ["get", "class"], "___HIDE_ALL___"];
    expect(
      shownClasses(buildPointCloudClassMask(expression, "class"))
    ).toEqual([]);
  });

  it("reads the class id from the configured property", () => {
    const expression = ["==", ["get", "klasse"], 3];
    expect(shownClasses(buildPointCloudClassMask(expression, "klasse"))).toEqual(
      [3]
    );
  });

  it("keeps every class for an expression that keeps them all", () => {
    expect(
      buildPointCloudClassMask([">=", ["get", "class"], 0], "class")
    ).toBeNull();
  });

  it("keeps every class for something that is not a filter", () => {
    expect(buildPointCloudClassMask(["no-such-op", 1], "class")).toBeNull();
  });
});
