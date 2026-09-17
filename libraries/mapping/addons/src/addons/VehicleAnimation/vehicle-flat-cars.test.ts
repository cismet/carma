import { describe, expect, it } from "vitest";

import type { FlatCar, FlatCarLayerOptions } from "./vehicle-flat-cars";
import { createFlatCarLayer } from "./vehicle-flat-cars";

const layerOptions = (): FlatCarLayerOptions => ({
  id: "cars",
  // only handed to the map once the layer is added, which these tests never do
  map: {} as FlatCarLayerOptions["map"],
  origin: [7.15, 51.25],
  colors: {
    body: "#3a8",
    joint: "#286",
    outline: "#123",
    highlight: "#fc0",
    highlightOutline: "#a80",
  },
  opacity: 1,
});

/** one two-point section, the smallest thing the layer can draw */
const section = (): FlatCar["strips"][number] =>
  ({
    kind: "section",
    left: [
      [7.15, 51.25],
      [7.1501, 51.25],
    ],
    right: [
      [7.15, 51.2501],
      [7.1501, 51.2501],
    ],
  } as FlatCar["strips"][number]);

describe("createFlatCarLayer", () => {
  it("draws a frame without vehicles", () => {
    // A timetable outside service hours, or one still loading, yields no
    // cars. That frame asked for room for nothing, which an empty mesh already
    // has, so no buffers were ever allocated and reading them threw — through
    // the error boundary, taking the whole map with it.
    const layer = createFlatCarLayer(layerOptions());
    expect(() => layer.setCars([])).not.toThrow();
    layer.dispose();
  });

  it("still draws vehicles after an empty frame", () => {
    const layer = createFlatCarLayer(layerOptions());
    layer.setCars([]);
    expect(() =>
      layer.setCars([
        { index: 0, strips: [section()], selected: false, elevation: 0 },
      ])
    ).not.toThrow();
    expect(layer.pick(7.15005, 51.25005)).toBe(0);
    layer.dispose();
  });
});
