import {
  BLACKOUT_LAYER_ID,
  baseOf,
  blackoutOf,
  composeDisplayConfig,
  layerTitle,
} from "./display-config";

describe("composeDisplayConfig", () => {
  const base = { layers: [{ id: "a" }, { id: "b" }] };

  it("puts the blackout above every scene layer", () => {
    const config = composeDisplayConfig(base, { on: false, fadeMs: 800 });
    expect(config.layers.map((l) => l.id)).toEqual(["a", "b", BLACKOUT_LAYER_ID]);
    expect(config.layers[2].opacity).toBe(0);
    expect(config.layers[2].opacityTransition).toBe(800);
  });

  it("keeps exactly one blackout layer when composed twice", () => {
    const once = composeDisplayConfig(base, { on: true, fadeMs: 800 });
    const twice = composeDisplayConfig(once, { on: false, fadeMs: 800 });
    expect(
      twice.layers.filter((l) => l.id === BLACKOUT_LAYER_ID)
    ).toHaveLength(1);
    expect(blackoutOf(twice)).toBe(false);
  });

  it("round-trips through baseOf", () => {
    const config = composeDisplayConfig(base, { on: true, fadeMs: 800 });
    expect(blackoutOf(config)).toBe(true);
    expect(baseOf(config)).toEqual(base);
  });
});

describe("layerTitle", () => {
  it("prefers the title", () => {
    expect(layerTitle({ id: "x", title: "Bäume" })).toBe("Bäume");
  });

  it("reads a style url when there is no title", () => {
    expect(
      layerTitle({
        id: "custom:https://tiles.cismet.de/pm_trees/modell.style.json",
        title: "",
      })
    ).toBe("pm_trees/modell");
  });

  it("falls back to a catalog id as it is", () => {
    expect(layerTitle({ id: "wuppKarten:R102:trueortho2024" })).toBe(
      "wuppKarten:R102:trueortho2024"
    );
  });
});
