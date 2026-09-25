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

  it("removes only the catalog caster when its layer is removed", () => {
    expect(getDzbPrmShadowVisibility(existing, false)).toMatchObject({
      bridgeExisting: true,
      catalogBridge: false,
    });
  });

  it("does not cast from a hidden catalog layer", () => {
    expect(
      getDzbPrmShadowVisibility({ ...existing, bridge: "catalog" }, false)
    ).toMatchObject({
      bridgeExisting: false,
      catalogBridge: false,
    });
  });

  it("keeps both shadow sources when the main collection eye is off", () => {
    expect(
      getDzbPrmShadowVisibility({ ...existing, visible: false }, true)
    ).toMatchObject({
      environment: true,
      zoo: true,
      station: true,
      bridgeExisting: true,
      catalogBridge: true,
    });
  });
});
