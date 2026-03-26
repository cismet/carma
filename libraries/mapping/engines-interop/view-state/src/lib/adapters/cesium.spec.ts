import { describe, expect, it } from "vitest";
import { readFromCesium } from "./cesium";

describe("readFromCesium", () => {
  it("returns null for transient scene reads during invalid hmr state", () => {
    const state = readFromCesium(
      {
        get camera() {
          throw new TypeError(
            "Cannot read properties of undefined (reading 'camera')"
          );
        },
      } as never,
      "spec"
    );

    expect(state).toBeNull();
  });
});
