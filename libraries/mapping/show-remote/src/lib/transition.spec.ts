import type { MappingConfig, MappingConfigLayer } from "@carma-api";

import { mergeLayerOrder, planSceneChange } from "./transition";

const layer = (id: string, opacity?: number): MappingConfigLayer => ({
  id,
  layerType: "vector",
  visible: true,
  ...(opacity === undefined ? {} : { opacity }),
});

const scene = (...layers: MappingConfigLayer[]): MappingConfig => ({
  layers,
});

const ids = (config: MappingConfig) => config.layers.map((l) => l.id);
const opacities = (config: MappingConfig) =>
  config.layers.map((l) => l.opacity ?? 1);

describe("mergeLayerOrder", () => {
  it("keeps the target order and puts an old layer above its old neighbour", () => {
    expect(
      mergeLayerOrder(
        [layer("base"), layer("old"), layer("top")],
        [layer("base"), layer("new"), layer("top")]
      )
    ).toEqual(["base", "old", "new", "top"]);
  });

  it("puts old layers below everything when nothing precedes them", () => {
    expect(
      mergeLayerOrder([layer("a"), layer("b")], [layer("c")])
    ).toEqual(["a", "b", "c"]);
  });
});

describe("planSceneChange", () => {
  const options = { fadeMs: 1500, prepareMs: 1000 };

  it("cuts in one write when nothing is shown yet", () => {
    const steps = planSceneChange(null, scene(layer("a")), options);
    expect(steps).toHaveLength(1);
    expect(ids(steps[0].config)).toEqual(["a"]);
  });

  it("cuts in one write when the fade is 0", () => {
    const steps = planSceneChange(scene(layer("a")), scene(layer("b")), {
      ...options,
      fadeMs: 0,
    });
    expect(steps).toHaveLength(1);
    expect(ids(steps[0].config)).toEqual(["b"]);
  });

  it("crossfades in three writes: prepare, fade, final", () => {
    const from = scene(layer("a"), layer("shared", 0.5));
    const to = scene(layer("shared", 1), layer("b"));
    const steps = planSceneChange(from, to, options);

    expect(steps.map((s) => s.holdMs)).toEqual([1000, 1500, 0]);

    // new layer present but transparent, nothing visible changes yet
    expect(ids(steps[0].config)).toEqual(["a", "shared", "b"]);
    expect(opacities(steps[0].config)).toEqual([1, 0.5, 0]);

    // every layer moves at once, the old one to zero
    expect(ids(steps[1].config)).toEqual(["a", "shared", "b"]);
    expect(opacities(steps[1].config)).toEqual([0, 1, 1]);
    expect(
      steps[1].config.layers.every((l) => l.opacityTransition === 1500)
    ).toBe(true);

    // the scene exactly, old layer gone
    expect(ids(steps[2].config)).toEqual(["shared", "b"]);
    expect(opacities(steps[2].config)).toEqual([1, 1]);
  });

  it("skips the prepare write when no layer is new", () => {
    const steps = planSceneChange(
      scene(layer("a"), layer("b")),
      scene(layer("a", 0.3)),
      options
    );
    expect(steps.map((s) => s.holdMs)).toEqual([1500, 0]);
    expect(opacities(steps[0].config)).toEqual([0.3, 0]);
  });

  it("switches the base map when the fade starts, not before", () => {
    const from: MappingConfig = {
      layers: [layer("a")],
      backgroundLayer: { selectedLayerId: "stadtplan" },
    };
    const to: MappingConfig = {
      layers: [layer("b")],
      backgroundLayer: { selectedLayerId: "luftbild" },
    };
    const steps = planSceneChange(from, to, options);
    expect(steps[0].config.backgroundLayer?.selectedLayerId).toBe("stadtplan");
    expect(steps[1].config.backgroundLayer?.selectedLayerId).toBe("luftbild");
  });
});
