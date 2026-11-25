import type { MapGeoJSONFeature } from "maplibre-gl";
import { describe, expect, it, vi } from "vitest";
import { isHiddenByOpacity } from "./SelectionManager";

// the utils barrel pulls in leaflet/maplibre, which need a browser
vi.mock("@carma-mapping/utils", () => ({ buildFeatureStateTarget: vi.fn() }));

const hit = (paint: Record<string, unknown>) =>
  ({ layer: { paint } }) as unknown as MapGeoJSONFeature;

describe("isHiddenByOpacity", () => {
  it("hides features drawn with opacity 0", () => {
    expect(isHiddenByOpacity(hit({ "fill-opacity": 0 }))).toBe(true);
    expect(isHiddenByOpacity(hit({ "line-opacity": 0 }))).toBe(true);
    expect(isHiddenByOpacity(hit({ "circle-opacity": 0 }))).toBe(true);
  });

  it("keeps ring markers (transparent circle, visible stroke)", () => {
    expect(
      isHiddenByOpacity(
        hit({ "circle-opacity": 0, "circle-stroke-width": 2 })
      )
    ).toBe(false);
    expect(
      isHiddenByOpacity(
        hit({
          "circle-opacity": 0,
          "circle-stroke-width": 2,
          "circle-stroke-opacity": 0,
        })
      )
    ).toBe(true);
  });

  it("keeps visible features", () => {
    expect(isHiddenByOpacity(hit({ "fill-opacity": 0.5 }))).toBe(false);
    expect(isHiddenByOpacity(hit({}))).toBe(false);
  });
});
