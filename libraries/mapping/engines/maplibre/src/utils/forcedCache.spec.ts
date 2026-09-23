import { afterEach, describe, expect, it } from "vitest";
import type { SourceSpecification } from "maplibre-gl";

import {
  isForcedCacheUrl,
  setForcedCachePrefixes,
  sourceUrlPrefixes,
  styleForcesCache,
} from "./forcedCache";

describe("sourceUrlPrefixes", () => {
  it("cuts a tile template at its first placeholder", () => {
    const source = {
      type: "raster",
      tiles: [
        "https://tiles.example.org/t50/{z}/{x}/{y}.png",
        "https://a.example.org/wms?bbox={bbox-epsg-3857}&layers=x",
      ],
    } as SourceSpecification;
    expect(sourceUrlPrefixes(source)).toEqual([
      "https://tiles.example.org/t50/",
      "https://a.example.org/wms?bbox=",
    ]);
  });

  it("keeps a template without placeholder whole", () => {
    const source = {
      type: "raster",
      tiles: ["https://tiles.example.org/static.png"],
    } as SourceSpecification;
    expect(sourceUrlPrefixes(source)).toEqual([
      "https://tiles.example.org/static.png",
    ]);
  });

  it("cuts a TileJSON url to its folder", () => {
    const source = {
      type: "vector",
      url: "https://tiles.example.org/osm/tiles.json",
    } as SourceSpecification;
    expect(sourceUrlPrefixes(source)).toEqual(["https://tiles.example.org/osm/"]);
  });

  it("gives nothing for a url that is not http(s)", () => {
    const source = {
      type: "vector",
      url: "pmtiles://tiles.example.org/osm.pmtiles",
    } as SourceSpecification;
    expect(sourceUrlPrefixes(source)).toEqual([]);
  });

  it("gives nothing for inline geojson", () => {
    const source = {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    } as SourceSpecification;
    expect(sourceUrlPrefixes(source)).toEqual([]);
  });

  it("skips tile entries that are not strings", () => {
    const source = {
      type: "raster",
      tiles: [42, "https://tiles.example.org/{z}/{x}/{y}.png"],
    } as unknown as SourceSpecification;
    expect(sourceUrlPrefixes(source)).toEqual(["https://tiles.example.org/"]);
  });
});

describe("styleForcesCache", () => {
  it("is true for carmaConf.cache forced", () => {
    expect(
      styleForcesCache({ metadata: { carmaConf: { cache: "forced" } } }),
    ).toBe(true);
  });

  it("is false for any other value or shape", () => {
    expect(
      styleForcesCache({ metadata: { carmaConf: { cache: "default" } } }),
    ).toBe(false);
    expect(styleForcesCache({ metadata: { carmaConf: {} } })).toBe(false);
    expect(styleForcesCache({ metadata: {} })).toBe(false);
    expect(styleForcesCache({})).toBe(false);
    expect(styleForcesCache(null)).toBe(false);
    expect(styleForcesCache(undefined)).toBe(false);
  });
});

describe("setForcedCachePrefixes / isForcedCacheUrl", () => {
  afterEach(() => setForcedCachePrefixes([]));

  it("matches urls starting with a set prefix", () => {
    setForcedCachePrefixes(["https://tiles.example.org/t50/"]);
    expect(isForcedCacheUrl("https://tiles.example.org/t50/17/1/2.png")).toBe(
      true,
    );
    expect(isForcedCacheUrl("https://tiles.example.org/t100/17/1/2.png")).toBe(
      false,
    );
  });

  it("drops empty prefixes, which would match every url", () => {
    setForcedCachePrefixes([""]);
    expect(isForcedCacheUrl("https://anything.example.org/")).toBe(false);
  });

  it("replaces the previous set", () => {
    setForcedCachePrefixes(["https://a.example.org/"]);
    setForcedCachePrefixes(["https://b.example.org/"]);
    expect(isForcedCacheUrl("https://a.example.org/x")).toBe(false);
    expect(isForcedCacheUrl("https://b.example.org/x")).toBe(true);
  });

  it("matches nothing when empty", () => {
    expect(isForcedCacheUrl("https://tiles.example.org/t50/1.png")).toBe(false);
  });
});
