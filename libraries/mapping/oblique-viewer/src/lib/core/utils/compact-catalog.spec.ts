import { describe, expect, it } from "vitest";
import { decodeCompactCatalog } from "./compact-catalog";

const deltas = (values: number[]) => {
  const bytes: number[] = [];
  for (const value of values) {
    let n = value < 0 ? BigInt(-value) * 2n - 1n : BigInt(value) * 2n;
    while (n >= 128n) {
      bytes.push(Number(n % 128n) + 128);
      n /= 128n;
    }
    bytes.push(Number(n));
  }
  return new Uint8Array(bytes);
};
const fixture = (
  change?: (header: any, columns: Record<string, number[]>) => void
) => {
  const columns: Record<string, number[]> = {
    captureLine: [3, 0, 0],
    captureWaypoint: [10, 1, 2],
    photoCapture: [0, 0, 1, 0, 1, 0],
    photoCamera: [0, 1, -1, 1, -1, 1],
    ecefX: [6_123_456_789, 300, 10_000, 400, 100, 500],
    ecefY: [1_234_567_890, 0, 0, 0, 0, 0],
    ecefZ: [4_567_890_123, 0, 0, 0, 0, 0],
    quaternionIndex: [3, 3, 0, 0, 0, 0],
    quaternionSmall0: [0, 0, 0, 0, 0, 0],
    quaternionSmall1: [0, 0, 0, 0, 0, 0],
    quaternionSmall2: [0, 0, 0, 0, 0, 0],
    sensorRange: [1_000_000, 1_001_000, 10_000, -1_001_002, 10_000, 0],
  };
  const camera = {
    sourceId: "camera",
    widthPx: 101,
    heightPx: 81,
    focalLengthMm: 10,
    imageMmToPixelAffine: [
      [10, 0, 47],
      [0, -10, 43],
    ],
    mountRotationDeg: 0,
  };
  const header: any = {
    format: "OBCQ0002",
    version: 2,
    seriesId: "arbitrary-series",
    imageCount: 6,
    captureCount: 3,
    cameraKeys: ["physical-camera-a", "physical-camera-b"],
    cameras: { "physical-camera-a": camera, "physical-camera-b": camera },
    conventions: {
      sourceGridConventions: {
        horizontalCrs: "EPSG:25832",
        verticalDatum: "dhhn2016",
      },
    },
    nameSchema: {
      imageIdTemplate: "{camera}_{line}_{waypoint}",
      stationIdTemplate: "_{line}_{waypoint}",
      cameraTokens: ["A", "B"],
      lineDigits: 2,
      waypointDigits: 4,
    },
    recordTemplates: [
      '{"assets":{"pyramid":{"href":"https://example.test/{imageId}.avif"}}}',
    ],
    quaternion: {
      order: "xyzw",
      scale: 10_000_000,
      sourceBasis: "EPSG:4978 world-to-camera",
    },
    positionScale: 1000,
    rangeScale: 1000,
    rangeSentinels: { "no-data": -2 },
    predictor: "linear-capture",
  };
  change?.(header, columns);
  const payload = Object.entries(columns).map(([name, values]) => ({
    name,
    values,
    bytes: deltas(values),
  }));
  header.sections = payload.map((p) => ({
    name: p.name,
    count: p.values.length,
    bytes: p.bytes.length,
  }));
  const json = new TextEncoder().encode(JSON.stringify(header));
  const bytes = new Uint8Array(
    12 + json.length + payload.reduce((sum, p) => sum + p.bytes.length, 0)
  );
  bytes.set(new TextEncoder().encode("OBCQ0002"));
  new DataView(bytes.buffer).setUint32(8, json.length, true);
  bytes.set(json, 12);
  let offset = 12 + json.length;
  payload.forEach((p) => {
    bytes.set(p.bytes, offset);
    offset += p.bytes.length;
  });
  return bytes;
};

describe("indexed compact catalogue", () => {
  it("decodes >32-bit ECEF, shared captures and gap-scaled linear prediction", () => {
    const catalog = decodeCompactCatalog(fixture());
    expect(Object.keys(catalog.images)).toEqual([
      "A_03_0010",
      "B_03_0010",
      "A_03_0011",
      "B_03_0011",
      "A_03_0013",
      "B_03_0013",
    ]);
    expect(
      Object.values(catalog.images).map((r) => r.cameraEcefMeters[0])
    ).toEqual([
      6123456.789, 6123457.089, 6123466.789, 6123467.189, 6123486.889,
      6123487.389,
    ]);
    expect(catalog.images.A_03_0010.cameraEcefMeters.slice(1)).toEqual([
      1234567.89, 4567890.123,
    ]);
    expect(catalog.images.A_03_0013.rotationMatrixRows).toEqual([
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ]);
    expect(catalog.images.B_03_0013.sensorGroundRangeMeters).toBeNull();
    expect(catalog.images.A_03_0013.sensorGroundRangeMeters).toBe(1020);
    expect(catalog.images.A_03_0013.assets?.pyramid?.href).toBe(
      "https://example.test/A_03_0013.avif"
    );
  });
  it("selects previous-capture prediction without a linear extrapolation", () => {
    const catalog = decodeCompactCatalog(
      fixture((h) => {
        h.predictor = "previous-capture";
      })
    );
    expect(catalog.images.A_03_0013.cameraEcefMeters[0]).toBe(6123466.889);
  });
  it("reconstructs serial filenames solely from the generic header and per-camera deltas", () => {
    const catalog = decodeCompactCatalog(
      fixture((h, c) => {
        h.nameSchema = {
          imageIdTemplate: "{line}_{waypoint}_{camera}{serial}",
          stationIdTemplate: "{line}_{waypoint}_",
          cameraTokens: ["170", "176"],
          lineDigits: 3,
          waypointDigits: 3,
          serialDigits: 6,
        };
        c.photoSerial = [123, 456, 1, 1, 2, 2];
      })
    );
    expect(Object.keys(catalog.images)).toEqual([
      "003_010_170000123",
      "003_010_176000456",
      "003_011_170000124",
      "003_011_176000457",
      "003_013_170000126",
      "003_013_176000459",
    ]);
    expect(catalog.images["003_013_176000459"].stationId).toBe("003_013_");
  });
  it("continues each camera's range differences across a new strip while resetting pose predictors", () => {
    const catalog = decodeCompactCatalog(
      fixture((_, c) => {
        c.captureLine[2] = 1;
        c.ecefX[4] = 6_123_486_889;
        c.ecefY[4] = 1_234_567_890;
        c.ecefZ[4] = 4_567_890_123;
        c.quaternionIndex[4] = 3;
        c.quaternionIndex[5] = 3;
      })
    );
    expect(catalog.images.A_04_0002.sensorGroundRangeMeters).toBe(1020);
    expect(catalog.images.B_04_0002.sensorGroundRangeMeters).toBeNull();
    expect(catalog.images.A_04_0002.cameraEcefMeters[0]).toBe(6123486.889);
  });
  it("accepts a Uint8Array slice with a nonzero byte offset", () => {
    const input = fixture(),
      padded = new Uint8Array(input.length + 30);
    padded.set(input, 17);
    expect(
      decodeCompactCatalog(padded.subarray(17, 17 + input.length)).images
        .A_03_0010.cameraEcefMeters[0]
    ).toBe(6123456.789);
  });
  it.each([
    [
      "unknown physical basis",
      (h: any) => {
        h.quaternion.sourceBasis = "UTM guess";
      },
    ],
    [
      "invalid capture index",
      (_: any, c: Record<string, number[]>) => {
        c.photoCapture[0] = 3;
      },
    ],
    [
      "unknown range sentinel",
      (_: any, c: Record<string, number[]>) => {
        c.sensorRange[0] = -99;
      },
    ],
    [
      "invalid quaternion",
      (_: any, c: Record<string, number[]>) => {
        c.quaternionSmall0[0] = 20_000_000;
      },
    ],
    [
      "duplicate generated identifier",
      (h: any) => {
        h.nameSchema.cameraTokens = ["A", "A"];
      },
    ],
    [
      "unsafe varint integer",
      (_: any, c: Record<string, number[]>) => {
        c.ecefX[0] = 2 ** 54;
      },
    ],
  ])("rejects %s", (_, change) => {
    expect(() => decodeCompactCatalog(fixture(change))).toThrow();
  });
  it("rejects truncated columns and unexpected trailing bytes", () => {
    const bytes = fixture();
    expect(() =>
      decodeCompactCatalog(bytes.subarray(0, bytes.length - 1))
    ).toThrow();
    const extra = new Uint8Array(bytes.length + 1);
    extra.set(bytes);
    expect(() => decodeCompactCatalog(extra)).toThrow();
  });
});
