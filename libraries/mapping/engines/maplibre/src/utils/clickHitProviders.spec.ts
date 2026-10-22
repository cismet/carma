import { describe, expect, it } from "vitest";
import type { MapGeoJSONFeature, Map as MaplibreMap, Point } from "maplibre-gl";

import {
  registerClickHitProvider,
  resolveProvidedClickHits,
} from "./clickHitProviders";

const point = { x: 10, y: 20 } as Point;
const hit = { id: 1, source: "bridge::adhoc" } as unknown as MapGeoJSONFeature;

describe("click hit providers", () => {
  it("answers with the first non-empty provider and nothing without one", () => {
    const map = {} as MaplibreMap;
    expect(resolveProvidedClickHits(map, point)).toBeNull();

    const removeEmpty = registerClickHitProvider(map, () => []);
    const removeHit = registerClickHitProvider(map, (asked) =>
      asked === point ? [hit] : null
    );
    expect(resolveProvidedClickHits(map, point)).toEqual([hit]);

    removeHit();
    expect(resolveProvidedClickHits(map, point)).toBeNull();
    removeEmpty();
  });

  it("keeps providers per map", () => {
    const map = {} as MaplibreMap;
    const other = {} as MaplibreMap;
    const remove = registerClickHitProvider(map, () => [hit]);
    expect(resolveProvidedClickHits(other, point)).toBeNull();
    remove();
  });
});
