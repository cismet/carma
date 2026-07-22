import { georadarStationAtClipUnit } from "./georadar-clip-coordinate";

describe("georadarStationAtClipUnit", () => {
  const nonUniformStations = [0, 1, 3, 6];

  it("maps the outer clip limits to the first and last slice stations", () => {
    expect(georadarStationAtClipUnit(nonUniformStations, 0)).toBe(0);
    expect(georadarStationAtClipUnit(nonUniformStations, 1)).toBe(6);
  });

  it("maps slice-center UVs back to their exact stations", () => {
    expect(georadarStationAtClipUnit(nonUniformStations, 0.125)).toBe(0);
    expect(georadarStationAtClipUnit(nonUniformStations, 0.375)).toBe(1);
    expect(georadarStationAtClipUnit(nonUniformStations, 0.625)).toBe(3);
    expect(georadarStationAtClipUnit(nonUniformStations, 0.875)).toBe(6);
  });

  it("interpolates a clipping plane between adjacent slice centers", () => {
    expect(georadarStationAtClipUnit(nonUniformStations, 0.25)).toBeCloseTo(
      0.5
    );
    expect(georadarStationAtClipUnit(nonUniformStations, 0.5)).toBeCloseTo(2);
  });
});
