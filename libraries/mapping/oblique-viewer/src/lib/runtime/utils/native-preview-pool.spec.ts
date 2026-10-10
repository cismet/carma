import { describe, expect, it, vi } from "vitest";
import type { DevicePixels, Ratio } from "@carma-units";
const poolOptions = vi.hoisted(() => vi.fn());
vi.mock("@carma-commons/image-pyramid", () => ({
  ImageLevelStackPool: class {
    constructor(options: unknown) {
      poolOptions(options);
    }
  },
}));
vi.mock("./tiff-download", () => ({ downloadTiffJpeg: vi.fn() }));
import {
  handoffNativePreviewComposer,
  takeNativePreviewComposer,
  fitNativePreviewView,
  lastNativePreviewView,
  nativePreviewSource,
  rememberNativePreviewView,
} from "./native-preview-pool";

const size = { width: 4000 as DevicePixels, height: 6000 as DevicePixels };
describe("native preview preparation adapter", () => {
  it("loads finer layers only for explicit Geoportal demands", () => {
    expect(poolOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        stackOptions: { idlePrefetch: "none", prefetchFiner: false },
      })
    );
  });
  it("uses the same AVIF source identity for preparation and display", () => {
    const input = {
      imageId: "LE_01_2",
      nativeSize: size,
      sourceUrl: "/fallback.jpg",
      avifPyramidUrl: "https://example.test/a.avif",
      path: "/legacy",
    };
    const warm = nativePreviewSource(input);
    const shown = nativePreviewSource({
      ...input,
      sourceUrl: "/unrelated/5/frame.jpg",
    });
    expect(shown).toEqual(warm);
    expect(warm.kind).toBe("avif");
    expect(warm.url).toBe("https://example.test/a.avif");
  });
  it("canonicalizes JPEG folders independently of the current preview level", () => {
    const input = {
      imageId: "023_144_17",
      nativeSize: size,
      path: "https://example.test/photos",
      minimumQualityLevel: "1" as const,
    };
    const warm = nativePreviewSource({
      ...input,
      sourceUrl: "https://example.test/photos/5/023_144_17.jpg",
    });
    expect(
      nativePreviewSource({
        ...input,
        sourceUrl: "https://example.test/photos/3/023_144_17.jpg",
      })
    ).toEqual(warm);
    expect(warm.url).toBe("https://example.test/photos/1/023_144_17.jpg");
    expect(warm.jpegLevels).toEqual([1, 2, 3, 4, 5, 6]);
  });
  it("predicts whole-photo fit using roll and physical pixels", () => {
    const source = nativePreviewSource({
      imageId: "fit",
      nativeSize: size,
      sourceUrl: "https://example.test/fit.avif",
      avifOnly: true,
    });
    const portrait = fitNativePreviewView(source, 1200, 800, 0, 2);
    const landscape = fitNativePreviewView(source, 1200, 800, Math.PI / 2, 2);
    expect(portrait.view.visible).toEqual({ x: 0, y: 0, ...size });
    expect(portrait.view.density).toBeCloseTo(0.24);
    expect(landscape.view.density).toBeCloseTo(0.36);
    expect(portrait.pixels).toBe(2400 * 1600);
  });
  it("retains at most eight view descriptions and refreshes recently used entries", () => {
    const sources = Array.from({ length: 9 }, (_, i) =>
      nativePreviewSource({
        imageId: `cache${i}`,
        nativeSize: size,
        sourceUrl: `https://example.test/cache${i}.avif`,
        avifOnly: true,
      })
    );
    const view = {
      visible: { x: 0 as DevicePixels, y: 0 as DevicePixels, ...size },
      density: 0.25 as Ratio,
    };
    for (const source of sources.slice(0, 8))
      rememberNativePreviewView(source, view, 100);
    rememberNativePreviewView(sources[0], view, 200);
    rememberNativePreviewView(sources[8], view, 100);
    expect(lastNativePreviewView(sources[1])).toBeUndefined();
    expect(lastNativePreviewView(sources[0])?.pixels).toBe(200);
    expect(lastNativePreviewView(sources[8])?.view).toBe(view);
  });
});

describe("prepared composer ownership", () => {
  const source = () =>
    nativePreviewSource({
      imageId: "ready",
      nativeSize: size,
      sourceUrl: "https://example.test/ready.avif",
      avifOnly: true,
    });
  it("allows exactly one claim for the same map, renderer and source", () => {
    const map = {} as Parameters<typeof handoffNativePreviewComposer>[0];
    const renderer = {} as Parameters<typeof handoffNativePreviewComposer>[2];
    const composer = { dispose: vi.fn() } as unknown as Parameters<
      typeof handoffNativePreviewComposer
    >[3];
    const photo = source();
    const release = handoffNativePreviewComposer(
      map,
      photo,
      renderer,
      composer
    );
    expect(
      takeNativePreviewComposer({} as typeof map, photo, renderer)
    ).toBeUndefined();
    expect(
      takeNativePreviewComposer(map, photo, {} as typeof renderer)
    ).toBeUndefined();
    expect(
      takeNativePreviewComposer(map, { ...photo, url: "other" }, renderer)
    ).toBeUndefined();
    expect(takeNativePreviewComposer(map, photo, renderer)).toBe(composer);
    expect(takeNativePreviewComposer(map, photo, renderer)).toBeUndefined();
    release();
    release();
    expect(composer.dispose).not.toHaveBeenCalled();
    composer.dispose();
  });
  it("disposes an unclaimed handoff once on cancellation", () => {
    const map = {} as Parameters<typeof handoffNativePreviewComposer>[0];
    const renderer = {} as Parameters<typeof handoffNativePreviewComposer>[2];
    const composer = { dispose: vi.fn() } as unknown as Parameters<
      typeof handoffNativePreviewComposer
    >[3];
    const photo = source();
    const release = handoffNativePreviewComposer(
      map,
      photo,
      renderer,
      composer
    );
    release();
    release();
    expect(composer.dispose).toHaveBeenCalledOnce();
    expect(takeNativePreviewComposer(map, photo, renderer)).toBeUndefined();
  });
  it("replaces an unclaimed handoff without disposing it twice or releasing its successor", () => {
    const map = {} as Parameters<typeof handoffNativePreviewComposer>[0];
    const renderer = {} as Parameters<typeof handoffNativePreviewComposer>[2];
    const previous = { dispose: vi.fn() } as unknown as Parameters<
      typeof handoffNativePreviewComposer
    >[3];
    const next = { dispose: vi.fn() } as unknown as Parameters<
      typeof handoffNativePreviewComposer
    >[3];
    const photo = source();
    const releasePrevious = handoffNativePreviewComposer(
      map,
      photo,
      renderer,
      previous
    );
    const releaseNext = handoffNativePreviewComposer(
      map,
      photo,
      renderer,
      next
    );
    expect(previous.dispose).toHaveBeenCalledOnce();
    releasePrevious();
    expect(previous.dispose).toHaveBeenCalledOnce();
    expect(next.dispose).not.toHaveBeenCalled();
    expect(takeNativePreviewComposer(map, photo, renderer)).toBe(next);
    releaseNext();
    expect(next.dispose).not.toHaveBeenCalled();
    next.dispose();
  });
});
