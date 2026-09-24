import { describe, expect, it } from "vitest";

import type { ModelCollectionState } from "../ModelCollection";
import { getDzbPrmShadowVisibility } from "./shadow-texture-assets";

const existing: ModelCollectionState = {
  visible: true,
  opacity: 0.25,
  quality: "5m",
  bridge: "existing",
};

describe("BuGa shadow casters", () => {
  it("keeps Bestand as a receiver and adds the separate catalog bridge as a caster", () => {
    expect(getDzbPrmShadowVisibility(existing, true)).toMatchObject({
      environment: true,
      zoo: true,
      station: true,
      bridge: false,
      bridgeExisting: true,
      catalogBridge: true,
    });
  });

  it("removes only the catalog caster when its layer is hidden", () => {
    expect(getDzbPrmShadowVisibility(existing, false)).toMatchObject({
      bridgeExisting: true,
      catalogBridge: false,
    });
  });

  it("still uses the catalog bridge when it is the selected collection variant", () => {
    expect(
      getDzbPrmShadowVisibility({ ...existing, bridge: "catalog" }, false)
    ).toMatchObject({
      bridgeExisting: false,
      catalogBridge: true,
    });
  });

  it("has no receiver or caster while the main collection is hidden", () => {
    expect(
      Object.values(
        getDzbPrmShadowVisibility({ ...existing, visible: false }, true)
      )
    ).toEqual([false, false, false, false, false, false]);
  });
});
