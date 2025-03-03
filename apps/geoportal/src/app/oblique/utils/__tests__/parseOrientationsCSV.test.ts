import { describe, test, expect } from "vitest";
import { processCsv } from "../parseOrientationsCSV";

describe("Image Orientations CSV Parser", () => {
  // Sample CSV data for testing
  const sampleCsvData = `;photo;x;y;z;omega;phi;kappa
;039_166_170004737;373981.407;5681739.955;921.939;-26.67239;33.70214;-137.85419
;039_166_171004737;373981.296;5681739.837;922.016;36.77012;21.96057;-153.45047
;039_166_174004737;373981.193;5681739.868;922.046;26.82911;-33.57648;-137.79065
;039_166_176004737;373981.260;5681740.050;922.049;-36.65432;-21.95423;-153.47306
;039_166_NAD004737;373981.234;5681739.975;921.972;0.09858;0.08796;-146.01166
;039_167_170004736;374047.923;5681784.242;921.477;-26.72724;33.61095;-137.75829
;039_167_171004736;374047.850;5681784.128;921.455;36.72301;21.99552;-153.32572
;039_167_174004736;374047.723;5681784.216;921.576;26.90271;-33.56362;-137.64763
;039_167_176004736;374047.809;5681784.358;921.453;-36.63398;-22.05727;-153.40428
;039_167_NAD004736;374047.898;5681784.343;921.467;0.09719;0.04528;-145.89824
;039_168_170004735;374114.509;5681828.698;921.256;-26.73033;33.67210;-137.75754
;039_168_171004735;374114.451;5681828.547;921.198;36.74329;22.02412;-153.38751
;039_168_174004735;374114.326;5681828.681;921.219;26.86555;-33.52721;-137.71018
;039_168_176004735;374114.459;5681828.779;921.225;-36.62875;-21.99082;-153.38898
;039_168_NAD004735;374114.453;5681828.716;921.185;0.09424;0.10519;-145.92645`;

  test("should parse correct number of records from CSV data", () => {
    const records = processCsv(sampleCsvData);
    expect(records.length).toBe(15);
  });

  test("should correctly parse camera IDs", () => {
    const records = processCsv(sampleCsvData);
    expect(records[0].id).toBe("039_166_170004737");
    expect(records[4].id).toBe("039_166_NAD004737");
  });

  test("should correctly parse camera positions", () => {
    const records = processCsv(sampleCsvData);
    const record = records[0];

    expect(record.perspectiveCenter).toEqual({
      x: 373981.407,
      y: 5681739.955,
      z: 921.939,
    });
  });

  test("should correctly parse camera orientations", () => {
    const records = processCsv(sampleCsvData);
    const record = records[0];

    // Check that angles are converted to radians
    const omegaRadians = -26.67239 * (Math.PI / 180);
    const phiRadians = 33.70214 * (Math.PI / 180);
    const kappaRadians = -137.85419 * (Math.PI / 180);

    expect(record.orientation.omega).toBeCloseTo(omegaRadians);
    expect(record.orientation.phi).toBeCloseTo(phiRadians);
    expect(record.orientation.kappa).toBeCloseTo(kappaRadians);
  });

  test("should include debug record when debug is enabled", () => {
    const records = processCsv(sampleCsvData, true);
    expect(records[0].__debugRecord).toBeDefined();
    expect(records[0].__debugRecord).toContain("039_166_170004737");
  });

  test("should not include debug record when debug is disabled", () => {
    const records = processCsv(sampleCsvData, false);
    expect(records[0].__debugRecord).toBeUndefined();
  });
});
