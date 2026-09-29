import { describe, expect, it } from "vitest";

import type { ToolEntry } from "@carma-mapping/layers";

import {
  conditionRouteOf,
  isShownByCondition,
  type ConditionalLayerConfig,
} from "./ConditionalLayer";

const layer = (config: ConditionalLayerConfig): { tools: ToolEntry[] } => ({
  tools: ["alwaysOnTop", { addon: "conditionalLayer", config }],
});

const at = (route: string, params: Record<string, string> = {}) => ({
  route,
  params,
});

// the bridge masks: on the pm-show route, or in the outlet with the bridge
const bridgeMask = layer({
  showWhen: [
    { param: "mask", match: "equals", value: "buga-bruecke" },
    { route: "pm-show" },
  ],
});

describe("isShownByCondition", () => {
  it("shows a layer without the tool everywhere", () => {
    expect(isShownByCondition({ tools: ["alwaysOnTop"] }, at("outlet"))).toBe(
      true
    );
    expect(isShownByCondition({}, at(""))).toBe(true);
  });

  it("shows the bridge mask where the url names the bridge", () => {
    expect(
      isShownByCondition(bridgeMask, at("outlet", { mask: "buga-bruecke" }))
    ).toBe(true);
    expect(
      isShownByCondition(bridgeMask, at("outlet", { mask: "BUGA-Bruecke" }))
    ).toBe(true);
  });

  it("shows the bridge mask on the pm-show route without a parameter", () => {
    expect(isShownByCondition(bridgeMask, at("pm-show"))).toBe(true);
  });

  it("leaves the bridge mask out for another insert or none", () => {
    expect(
      isShownByCondition(bridgeMask, at("outlet", { mask: "bestand" }))
    ).toBe(false);
    expect(isShownByCondition(bridgeMask, at("outlet"))).toBe(false);
    expect(isShownByCondition(bridgeMask, at(""))).toBe(false);
  });

  it("lets hideWhen win over showWhen", () => {
    const entry = layer({
      showWhen: [{ route: "pm-show" }],
      hideWhen: [{ param: "mask", match: "present" }],
    });
    expect(isShownByCondition(entry, at("pm-show"))).toBe(true);
    expect(isShownByCondition(entry, at("pm-show", { mask: "x" }))).toBe(false);
  });

  it("hides with hideWhen alone, the other way around", () => {
    const entry = layer({
      hideWhen: [{ param: "mask", value: ["buga-bruecke", "zoo"] }],
    });
    expect(isShownByCondition(entry, at("outlet"))).toBe(true);
    expect(isShownByCondition(entry, at("outlet", { mask: "zoo" }))).toBe(
      false
    );
  });

  it("compares by contains, startsWith and regex", () => {
    const params = { model: "zoo-kubitur-bruecke-2m" };
    const shown = (condition: ConditionalLayerConfig) =>
      isShownByCondition(layer(condition), at("outlet", params));
    expect(
      shown({
        showWhen: [{ param: "model", match: "contains", value: "bruecke" }],
      })
    ).toBe(true);
    expect(
      shown({
        showWhen: [{ param: "model", match: "startsWith", value: "zoo" }],
      })
    ).toBe(true);
    expect(
      shown({
        showWhen: [{ param: "model", match: "regex", value: "-\\d+m$" }],
      })
    ).toBe(true);
    expect(
      shown({
        showWhen: [
          {
            param: "model",
            match: "contains",
            value: "BRUECKE",
            caseSensitive: true,
          },
        ],
      })
    ).toBe(false);
  });

  it("never holds on an invalid regex", () => {
    const entry = layer({
      showWhen: [{ param: "mask", match: "regex", value: "(" }],
    });
    expect(isShownByCondition(entry, at("outlet", { mask: "(" }))).toBe(false);
  });
});

describe("conditionRouteOf", () => {
  it("names the route by its first path segment", () => {
    expect(conditionRouteOf("/pm-show")).toBe("pm-show");
    expect(conditionRouteOf("/outlet/")).toBe("outlet");
    expect(conditionRouteOf("/")).toBe("");
  });
});
