import { describe, expect, it } from "vitest";
import {
  chooseImageQualityVariant,
  chromaSubsamplingMeetsPolicy,
  parseImageQualityManifest,
  type ImageQualityVariant,
} from "./image-quality-comparison";
const variant = (
  overrides: Partial<ImageQualityVariant> = {}
): ImageQualityVariant => ({
  bitDepth: 10,
  chroma: "444",
  encoderQuality: 96,
  ssimulacra2: 96,
  bytes: 500,
  href: "photo.avif",
  ...overrides,
});
describe("measured image quality comparison", () => {
  it("chooses the smallest measured file meeting the common target, without treating Q as a score", () => {
    const variants = [
      variant({ bytes: 800, encoderQuality: 99 }),
      variant({ bytes: 400, ssimulacra2: 95.3 }),
      variant({ bytes: 300, ssimulacra2: 94.9 }),
    ];
    expect(chooseImageQualityVariant(variants, 10, "444", 95)).toEqual({
      variant: variants[1],
      meetsTarget: true,
    });
  });
  it("shows the best attainable candidate but does not claim an unreachable target", () => {
    const best = variant({ chroma: "420", ssimulacra2: 93 });
    expect(chooseImageQualityVariant([variant(), best], 10, "420", 95)).toEqual(
      { variant: best, meetsTarget: false }
    );
    expect(
      chooseImageQualityVariant([variant()], 8, "444", 95).variant
    ).toBeUndefined();
  });
  it("requires at least33% faster loading and the quality target before subsampling is eligible", () => {
    expect(chromaSubsamplingMeetsPolicy(100, 67, 95, 95)).toBe(true);
    expect(chromaSubsamplingMeetsPolicy(100, 67.01, 95, 95)).toBe(false);
    expect(chromaSubsamplingMeetsPolicy(100, 40, 94.99, 95)).toBe(false);
    expect(chromaSubsamplingMeetsPolicy(Infinity, 40, 95, 95)).toBe(false);
  });
  it("resolves measured external assets and rejects unknown tile layouts or invalid measurements", () => {
    const source = {
      id: "north",
      label: "Nord",
      width: 1024,
      height: 1024,
      variants: [variant()],
    };
    const input = { schemaVersion: 1, tileSize: 512, sources: [source] };
    expect(
      parseImageQualityManifest(
        input,
        "http://localhost:4318/quality-compare/manifest.json"
      ).sources[0].variants[0].href
    ).toBe("http://localhost:4318/quality-compare/photo.avif");
    expect(() =>
      parseImageQualityManifest(
        { ...input, tileSize: 768 },
        "https://images.test/"
      )
    ).toThrow();
    expect(() =>
      parseImageQualityManifest(
        {
          ...input,
          sources: [{ ...source, variants: [variant({ ssimulacra2: NaN })] }],
        },
        "https://images.test/"
      )
    ).toThrow();
  });
  it("keeps level and scene identity for a common native footprint", () => {
    const input = {
      schemaVersion: 1,
      tileSize: 512,
      sources: [
        {
          id: "north:L4",
          groupId: "north",
          level: 4,
          label: "Nord",
          width: 128,
          height: 128,
          variants: [variant()],
          referenceTiles: {
            tileSize: 512,
            baseUrl: "../reference-tiles/north/L4/",
          },
        },
      ],
    };
    const result = parseImageQualityManifest(
      input,
      "http://localhost:4318/quality-compare/manifest.json"
    );
    expect(result.sources[0]).toMatchObject({
      groupId: "north",
      level: 4,
      width: 128,
    });
    expect(result.sources[0].referenceTiles?.baseUrl).toBe(
      "http://localhost:4318/reference-tiles/north/L4/"
    );
    expect(() =>
      parseImageQualityManifest(
        { ...input, sources: [{ ...input.sources[0], level: 5 }] },
        "http://localhost:4318/"
      )
    ).toThrow();
  });
});

describe("offline façade comparison metadata", () => {
  const input = () => ({
    schemaVersion: 1,
    tileSize: 512,
    sources: [
      {
        id: "north:L2",
        groupId: "north",
        level: 2,
        label: "Nord",
        width: 3551,
        height: 2663,
        presets: [{ id: "facade", label: "Fassade", center: [0.49, 0.065] }],
        variants: [
          {
            ...variant(),
            offlineRgbPsnrDb: 45.7,
            errorTiles: {
              baseUrl: "../errors/north/L2/",
              tileSize: 512,
              gain: 32,
            },
          },
        ],
      },
    ],
  });
  it("keeps normalized presets and resolves offline tiles separately from AVIF metadata", () => {
    const source = parseImageQualityManifest(
      input(),
      "https://images.test/quality/manifest.json"
    ).sources[0];
    expect(source.presets).toEqual([
      { id: "facade", label: "Fassade", center: [0.49, 0.065] },
    ]);
    expect(source.variants[0]).toMatchObject({
      bytes: 500,
      encoderQuality: 96,
      offlineRGBPsnrDb: 45.7,
      errorTiles: {
        baseUrl: "https://images.test/errors/north/L2/",
        tileSize: 512,
        gain: 32,
      },
    });
  });
  it.each([
    [-0.01, 0],
    [1.01, 0.5],
    [0.5, NaN],
  ])("rejects non-normalized preset center %s/%s", (x, y) => {
    const raw = input();
    raw.sources[0].presets[0].center = [x, y];
    expect(() =>
      parseImageQualityManifest(raw, "https://images.test/")
    ).toThrow("Invalid normalized comparison preset");
  });
  it("rejects wrong error-map calibration and nonfinite or nonpositive offline PSNR", () => {
    for (const gain of [1, 31, 64]) {
      const raw = input();
      raw.sources[0].variants[0].errorTiles.gain = gain;
      expect(() =>
        parseImageQualityManifest(raw, "https://images.test/")
      ).toThrow();
    }
    for (const psnr of [0, -1, Infinity, NaN]) {
      const raw = input();
      raw.sources[0].variants[0].offlineRgbPsnrDb = psnr;
      expect(() =>
        parseImageQualityManifest(raw, "https://images.test/")
      ).toThrow("Invalid measured image variant");
    }
    const raw = input();
    raw.sources[0].presets.push({ ...raw.sources[0].presets[0] });
    expect(() =>
      parseImageQualityManifest(raw, "https://images.test/")
    ).toThrow("Invalid normalized comparison preset");
  });
});
