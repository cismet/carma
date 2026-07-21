import { describe, expect, it } from "vitest";

import type { Layer, LayerGroup, LayerStackEntry } from "../lib/contracts/carma-layers.d";
import {
  findStackEntryByLayerId,
  flattenLayerStack,
} from "./layerStack";

const layer = (id: string, overrides: Partial<Layer> = {}): Layer =>
  ({ id, title: id, visible: true, ...overrides } as Layer);

const group = (
  id: string,
  layers: Layer[],
  overrides: Partial<LayerGroup> = {}
): LayerGroup => ({
  type: "group",
  id,
  title: id,
  visible: true,
  layers,
  ...overrides,
});

describe("flattenLayerStack", () => {
  it("inlines group members at the group's position", () => {
    const stack: LayerStackEntry[] = [
      layer("a"),
      group("g", [layer("m1"), layer("m2")]),
      layer("b"),
    ];

    expect(flattenLayerStack(stack).map((l) => l.id)).toEqual([
      "a",
      "m1",
      "m2",
      "b",
    ]);
  });

  it("hides every member of a hidden group without touching their own state", () => {
    const member = layer("m", { visible: true });
    const stack = [group("g", [member], { visible: false })];

    expect(flattenLayerStack(stack)[0].visible).toBe(false);
    // the member keeps its own setting, so re-showing the group restores it
    expect(member.visible).toBe(true);
  });

  it("keeps a member hidden inside a visible group", () => {
    const stack = [group("g", [layer("m", { visible: false })])];

    expect(flattenLayerStack(stack)[0].visible).toBe(false);
  });

  it("multiplies the group opacity onto the member opacity", () => {
    const stack = [group("g", [layer("m", { opacity: 0.5 })], { opacity: 0.5 })];

    expect(flattenLayerStack(stack)[0].opacity).toBe(0.25);
  });

  it("leaves member opacity alone when the group sets none", () => {
    const stack = [group("g", [layer("m", { opacity: 0.4 })])];

    expect(flattenLayerStack(stack)[0].opacity).toBe(0.4);
  });
});

describe("findStackEntryByLayerId", () => {
  const stack: LayerStackEntry[] = [
    layer("a"),
    group("g", [layer("m1"), layer("m2")]),
  ];

  it("resolves a top level layer", () => {
    const found = findStackEntryByLayerId(stack, "a");
    expect(found?.index).toBe(0);
    expect(found?.member).toBeUndefined();
  });

  it("resolves a group by its own id, without a member", () => {
    const found = findStackEntryByLayerId(stack, "g");
    expect(found?.index).toBe(1);
    expect(found?.member).toBeUndefined();
  });

  it("resolves a member to its group and itself", () => {
    const found = findStackEntryByLayerId(stack, "m2");
    expect(found?.index).toBe(1);
    expect(found?.entry.id).toBe("g");
    expect(found?.member?.id).toBe("m2");
  });

  it("returns undefined for an unknown id", () => {
    expect(findStackEntryByLayerId(stack, "nope")).toBeUndefined();
  });
});

describe("group marker on flattened members", () => {
  it("stamps members with their group so the flat list still names it", () => {
    const stack = [group("g", [layer("m")], { title: "Gesundheit" })];

    expect(flattenLayerStack(stack)[0].group).toEqual({
      id: "g",
      title: "Gesundheit",
    });
  });

});
