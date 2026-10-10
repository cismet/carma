import { describe, expect, it } from "vitest";
import { viewportFoveatedTarget } from "./viewport-foveation";

const viewport = { width: 800, height: 600 };
const target = (x: number, y: number, cellRadiusPixels = 0, density = 0.8) =>
  viewportFoveatedTarget({
    density,
    point: { x, y },
    viewport,
    cellRadiusPixels,
  });

describe("viewport foveated demand", () => {
  it("retains one buffer-pixel demand at the center and throughout the inner fifth", () => {
    expect(target(400, 300)).toEqual({
      density: 0.8,
      pixelError: 1,
      focusDistance: 0,
    });
    expect(target(480, 360)).toEqual({
      density: 0.8,
      pixelError: 1,
      focusDistance: 0.2,
    });
    expect(target(800, 600)).toEqual({
      density: 0.2,
      pixelError: 4,
      focusDistance: 1,
    });
  });

  it("smoothly and monotonically relaxes the error toward the corners", () => {
    let previous = target(400, 300);
    for (let i = 1; i <= 100; i++) {
      const next = target(400 + i * 4, 300 + i * 3);
      expect(next.pixelError).toBeGreaterThanOrEqual(previous.pixelError);
      expect(next.density).toBeLessThanOrEqual(previous.density);
      expect(next.pixelError).toBeLessThanOrEqual(4);
      previous = next;
    }
    expect(target(640, 480).pixelError).toBeCloseTo(2.5);
    expect(target(480.0004, 360.0003).pixelError - 1).toBeLessThan(1e-9);
    expect(4 - target(799.9996, 599.9997).pixelError).toBeLessThan(1e-9);
  });

  it("uses the closest cell point so a cell containing the focus never loses detail", () => {
    expect(target(640, 480, 300)).toEqual(target(400, 300));
    expect(target(640, 480, 200)).toEqual(target(480, 360));
    expect(target(640, 480, 100).pixelError).toBeLessThan(
      target(640, 480).pixelError
    );
    expect(target(800, 600, 1000).focusDistance).toBe(0);
  });

  it("is mirror symmetric and unchanged by portrait rotation", () => {
    const expected = target(640, 480, 25);
    expect(target(160, 480, 25)).toEqual(expected);
    expect(target(640, 120, 25)).toEqual(expected);
    expect(
      viewportFoveatedTarget({
        density: 0.8,
        point: { x: 480, y: 640 },
        viewport: { width: 600, height: 800 },
        cellRadiusPixels: 25,
      })
    ).toEqual(expected);
  });

  it("does not apply DPR twice when all coordinates are already buffer pixels", () => {
    expect(
      viewportFoveatedTarget({
        density: 0.8,
        point: { x: 1280, y: 960 },
        viewport: { width: 1600, height: 1200 },
        cellRadiusPixels: 50,
      })
    ).toEqual(target(640, 480, 25));
  });

  it("caps native density only after applying the requested pixel error", () => {
    expect(target(400, 300, 0, 2).density).toBe(1);
    expect(target(800, 600, 0, 2).density).toBe(0.5);
    expect(target(800, 600, 0, 8).density).toBe(1);
    expect(target(800, 600, 0, 0).density).toBe(0);
    expect(target(1600, 1200).pixelError).toBe(4);
  });

  it("keeps invalid or unknown locations conservatively sharp and outputs finite demand", () => {
    const base = { density: 0.8, point: { x: 800, y: 600 }, viewport };
    const invalid = [
      { ...base, point: undefined },
      { ...base, point: { x: NaN, y: 0 } },
      { ...base, point: { x: 0, y: Infinity } },
      { ...base, viewport: { width: 0, height: 600 } },
      { ...base, viewport: { width: 800, height: -1 } },
      { ...base, viewport: { width: Infinity, height: 600 } },
      { ...base, viewport: { width: 800, height: NaN } },
      { ...base, cellRadiusPixels: -1 },
      { ...base, cellRadiusPixels: NaN },
      { ...base, cellRadiusPixels: Infinity },
    ];
    for (const options of invalid)
      expect(viewportFoveatedTarget(options)).toEqual({
        density: 0.8,
        pixelError: 1,
        focusDistance: 0,
      });
    for (const density of [NaN, Infinity, -1])
      expect(viewportFoveatedTarget({ density, viewport }).density).toBe(1);
  });
});
