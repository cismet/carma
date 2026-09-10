import { Blob as NativeBlob } from "node:buffer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  encodeTypedBinaryRecord,
  decodeTypedBinaryRecord,
} from "@carma-commons/utils";

import {
  SHADOW_CORRIDOR_CACHE,
  isShadowCorridorCacheRecord,
  shadowCorridorCacheKey,
  type ShadowCorridorCacheIdentity,
  type ShadowCorridorCacheRecord,
} from "./shadow-corridor-cache-record";

const identity: ShadowCorridorCacheIdentity = {
  source: "terrain:2024",
  dateTime: "2026-09-08T12:00:00Z",
  corridor: "grid:1:2",
  resolution: "lod:5",
  geometryFingerprint: "tiles:1234",
  samples: 1,
};
const fixture = (): ShadowCorridorCacheRecord => ({
  schema: SHADOW_CORRIDOR_CACHE.schema,
  identity,
  width: 2,
  height: 1,
  visibility: new Float32Array([0, 0.75]),
  depth: new Float32Array([0.25, 1]),
  captureMatrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  worldBasis: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 400, 500, 600, 1],
  crop: [0.25, 0, 0.5, 1],
});

beforeEach(() => vi.stubGlobal("Blob", NativeBlob));
afterEach(() => vi.unstubAllGlobals());

describe("persistent corridor identity and binary record", () => {
  it("keeps hard and soft results, source revisions and geometry distinct", () => {
    const key = shadowCorridorCacheKey(identity);
    for (const change of [
      { samples: 128 },
      { source: "terrain:2025" },
      { dateTime: "2026-09-08T13:00:00Z" },
      { geometryFingerprint: "tiles:5678" },
      { corridor: "grid:1:3" },
      { resolution: "lod:6" },
    ]) {
      expect(shadowCorridorCacheKey({ ...identity, ...change })).not.toBe(key);
    }
    expect(shadowCorridorCacheKey({ ...identity, source: "" })).toBeNull();
    expect(shadowCorridorCacheKey({ ...identity, samples: 0 })).toBeNull();
  });

  it("does not key by capture camera or scene origin, and round-trips both bases losslessly", async () => {
    const original = fixture();
    const decoded = await decodeTypedBinaryRecord<ShadowCorridorCacheRecord>(
      encodeTypedBinaryRecord(original)
    );
    expect(isShadowCorridorCacheRecord(decoded, identity)).toBe(true);
    expect(decoded.visibility).toEqual(original.visibility);
    expect(decoded.depth).toEqual(original.depth);
    expect(decoded.worldBasis).toEqual(original.worldBasis);
    expect(decoded.captureMatrix).toEqual(original.captureMatrix);
    const otherCamera = {
      ...decoded,
      captureMatrix: original.captureMatrix.map((v) => v * 2),
    };
    expect(shadowCorridorCacheKey(otherCamera.identity)).toBe(
      shadowCorridorCacheKey(identity)
    );
  });

  it("rejects mismatched identity, malformed lengths, depth and visibility", () => {
    const record = fixture();
    expect(
      isShadowCorridorCacheRecord(record, { ...identity, samples: 128 })
    ).toBe(false);
    for (const change of [
      { width: 3 },
      { width: Infinity },
      { height: -1 },
      { schema: "unknown" },
      { captureMatrix: [1] },
      { crop: [0.9, 0, 0.5, 1] },
      { worldBasis: [...record.worldBasis.slice(0, 15), NaN] },
      { visibility: new Float32Array([0, NaN]) },
      { visibility: new Float32Array([0, 1.001]) },
      { depth: new Float32Array([-0.1, 1]) },
    ])
      expect(
        isShadowCorridorCacheRecord({ ...record, ...change }, identity)
      ).toBe(false);
  });
});
