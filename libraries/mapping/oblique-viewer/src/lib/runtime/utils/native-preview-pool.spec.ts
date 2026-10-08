import { describe, expect, it, vi } from "vitest";
import type { DevicePixels, Ratio } from "@carma-units";
vi.mock("@carma-commons/image-streaming", () => ({ ImageLevelStackPool: class {} }));
vi.mock("./tiff-download", () => ({ downloadTiffJpeg: vi.fn() }));
import { fitNativePreviewView, lastNativePreviewView, nativePreviewSource, rememberNativePreviewView } from "./native-preview-pool";

const size = { width: 4000 as DevicePixels, height: 6000 as DevicePixels };
describe("native preview preparation adapter", () => {
  it("uses the same AVIF source identity for preparation and display", () => {
    const input = { imageId: "LE_01_2", nativeSize: size, sourceUrl: "/fallback.jpg", avifPyramidUrl: "https://example.test/a.avif", path: "/legacy" };
    const warm = nativePreviewSource(input);
    const shown = nativePreviewSource({ ...input, sourceUrl: "/unrelated/5/frame.jpg" });
    expect(shown).toEqual(warm);
    expect(warm.kind).toBe("avif");
    expect(warm.url).toBe("https://example.test/a.avif");
  });
  it("canonicalizes JPEG folders independently of the current preview level", () => {
    const input = { imageId: "023_144_17", nativeSize: size, path: "https://example.test/photos", minimumQualityLevel: "1" as const };
    const warm = nativePreviewSource({ ...input, sourceUrl: "https://example.test/photos/5/023_144_17.jpg" });
    expect(nativePreviewSource({ ...input, sourceUrl: "https://example.test/photos/3/023_144_17.jpg" })).toEqual(warm);
    expect(warm.url).toBe("https://example.test/photos/1/023_144_17.jpg");
    expect(warm.jpegLevels).toEqual([1, 2, 3, 4, 5, 6]);
  });
  it("predicts whole-photo fit using roll and physical pixels", () => {
    const source = nativePreviewSource({ imageId: "fit", nativeSize: size, sourceUrl: "https://example.test/fit.avif", avifOnly: true });
    const portrait = fitNativePreviewView(source, 1200, 800, 0, 2);
    const landscape = fitNativePreviewView(source, 1200, 800, Math.PI / 2, 2);
    expect(portrait.view.visible).toEqual({ x: 0, y: 0, ...size });
    expect(portrait.view.density).toBeCloseTo(0.24);
    expect(landscape.view.density).toBeCloseTo(0.36);
    expect(portrait.pixels).toBe(2400 * 1600);
  });
  it("retains at most eight view descriptions and refreshes recently used entries", () => {
    const sources = Array.from({ length: 9 }, (_, i) => nativePreviewSource({ imageId: `cache${i}`, nativeSize: size, sourceUrl: `https://example.test/cache${i}.avif`, avifOnly: true }));
    const view = { visible: { x: 0 as DevicePixels, y: 0 as DevicePixels, ...size }, density: 0.25 as Ratio };
    for (const source of sources.slice(0, 8)) rememberNativePreviewView(source, view, 100);
    rememberNativePreviewView(sources[0], view, 200);
    rememberNativePreviewView(sources[8], view, 100);
    expect(lastNativePreviewView(sources[1])).toBeUndefined();
    expect(lastNativePreviewView(sources[0])?.pixels).toBe(200);
    expect(lastNativePreviewView(sources[8])?.view).toBe(view);
  });
});
