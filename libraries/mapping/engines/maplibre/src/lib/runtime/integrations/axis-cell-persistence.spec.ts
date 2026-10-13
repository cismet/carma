import { afterEach, describe, expect, it, vi } from "vitest";
import {
  axisCellGeometryKey,
  readAxisCell,
  writeAxisCell,
} from "./axis-cell-persistence";

afterEach(() => vi.unstubAllGlobals());

describe("best-image cell persistence identity", () => {
  it("requires a stable catalog namespace and changes for calibration, height or membership", async () => {
    const geometry = new Float64Array([1, 2, 3, 4]);
    const initial = await axisCellGeometryKey("catalog-a|ids-a", geometry, 64);
    expect(initial).toMatch(/^catalog-a\|ids-a\|64\|[0-9a-f]{64}$/);
    expect(await axisCellGeometryKey("catalog-a|ids-a", geometry, 64)).toBe(
      initial
    );
    expect(await axisCellGeometryKey(undefined, geometry, 64)).toBeNull();
    expect(await axisCellGeometryKey("catalog-b|ids-a", geometry, 64)).not.toBe(
      initial
    );
    expect(await axisCellGeometryKey("catalog-a|ids-b", geometry, 64)).not.toBe(
      initial
    );
    expect(await axisCellGeometryKey("catalog-a|ids-a", geometry, 32)).not.toBe(
      initial
    );
    geometry[3] = 5;
    expect(await axisCellGeometryKey("catalog-a|ids-a", geometry, 64)).not.toBe(
      initial
    );
  });

  it("restores the same numeric tile on an HTTP LAN worker without WebCrypto", async () => {
    const geometry = new Float64Array([1, 2, 3, 4]);
    const webCryptoKey = await axisCellGeometryKey(
      "revision|ids",
      geometry,
      64
    );
    const fullWindow = Float64Array.from(
      { length: 25 * 19 },
      (_, index) => index / 10
    );
    const fullWindowKey = await axisCellGeometryKey(
      "revision|25-ids",
      fullWindow,
      64
    );
    vi.stubGlobal("crypto", undefined);
    const fallbackKey = await axisCellGeometryKey("revision|ids", geometry, 64);
    expect(fallbackKey).toBe(webCryptoKey);
    expect(await axisCellGeometryKey("revision|25-ids", fullWindow, 64)).toBe(
      fullWindowKey
    );

    const cells = new Map<string, unknown>();
    const db = {
      transaction: () => {
        const transaction: {
          oncomplete?: () => void;
          objectStore: () => {
            put: (value: { key: string }) => void;
            get: (key: string) => { result?: unknown; onsuccess?: () => void };
          };
        } = {
          objectStore: () => ({
            put: (value) => {
              queueMicrotask(() => {
                cells.set(value.key, value);
                transaction.oncomplete?.();
              });
            },
            get: (key) => {
              const request: { result?: unknown; onsuccess?: () => void } = {};
              queueMicrotask(() => {
                request.result = cells.get(key);
                request.onsuccess?.();
              });
              return request;
            },
          }),
        };
        return transaction;
      },
    };
    vi.stubGlobal("indexedDB", {
      open: () => {
        const request: { result?: unknown; onsuccess?: () => void } = {};
        queueMicrotask(() => {
          request.result = db;
          request.onsuccess?.();
        });
        return request;
      },
    });
    const cellKey = `${fallbackKey}|0:0:0`;
    await writeAxisCell(cellKey, new Uint32Array([0, 2, 4]));
    expect(Array.from((await readAxisCell(cellKey, 5)) ?? [])).toEqual([
      0, 2, 4,
    ]);
    expect(await readAxisCell(cellKey, 4)).toBeNull();
  });
});
