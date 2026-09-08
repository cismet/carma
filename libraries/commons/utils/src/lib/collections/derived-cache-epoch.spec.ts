import { describe, expect, it } from "vitest";

import { resolveDerivedCacheAssetEpoch } from "./derived-cache-epoch";
import type { DerivedCacheAssetEpochOptions } from "./derived-cache-epoch";

const resolve = (assetUrl: string, production = true) =>
  resolveDerivedCacheAssetEpoch({ assetUrl, production });

describe("derived cache producer asset epoch", () => {
  it.each([
    "https://example.com/assets/terrain.worker-Ab12Cd34.js",
    "http://localhost:4200/nested/assets/terrain-worker-Ab12Cd34Ef56.js",
    "https://example.com/assets/terrain.worker-Ab_1-Cd2.js",
  ])("preserves the complete hashed production URL %s", (assetUrl) => {
    expect(resolve(assetUrl)).toBe(assetUrl);
  });

  it("returns the canonical URL including its origin and asset path", () => {
    expect(resolve("HTTPS://EXAMPLE.COM:443/assets/terrain.worker-Ab12Cd34.js"))
      .toBe("https://example.com/assets/terrain.worker-Ab12Cd34.js");
  });

  it("does not collapse distinct producer names, origins or hash prefixes", () => {
    const urls = [
      "https://example.com/assets/terrain.worker-Ab12Cd34.js",
      "https://example.com/assets/terrain.worker-Ab12Cd34Ef56.js",
      "https://example.com/assets/terrain.worker-Ab12Cd34-one.js",
      "https://example.com/assets/terrain.worker-Ab12Cd34-two.js",
      "https://example.com/assets/other.worker-Ab12Cd34.js",
      "https://other.example.com/assets/terrain.worker-Ab12Cd34.js",
    ];
    const epochs = urls.map((url) => resolve(url));
    expect(epochs).toEqual(urls);
    expect(new Set(epochs).size).toBe(urls.length);
  });

  it("rejects development mode even for a hashed-looking worker URL", () => {
    expect(resolve("https://example.com/assets/terrain.worker-Ab12Cd34.js", false))
      .toBeNull();
  });

  it.each([
    "/assets/terrain.worker-Ab12Cd34.js",
    "//example.com/assets/terrain.worker-Ab12Cd34.js",
    "https:example.com/assets/terrain.worker-Ab12Cd34.js",
    "file:///assets/terrain.worker-Ab12Cd34.js",
    "blob:https://example.com/terrain.worker-Ab12Cd34.js",
    "data:text/javascript,terrain.worker-Ab12Cd34.js",
    "ftp://example.com/assets/terrain.worker-Ab12Cd34.js",
    "https:///assets/terrain.worker-Ab12Cd34.js",
    "https://[invalid/assets/terrain.worker-Ab12Cd34.js",
  ])("rejects non-absolute HTTP assets and malformed URLs %s", (assetUrl) => {
    expect(resolve(assetUrl)).toBeNull();
  });

  it.each([
    "https://example.com/src/terrain.worker.ts",
    "https://example.com/src/terrain.worker.js",
    "https://example.com/@vite/client",
    "https://example.com/@id/terrain.worker",
    "https://example.com/assets/terrain-worker.js",
    "https://example.com/assets/terrain.worker-Ab12Cd3.js",
    "https://example.com/assets/terrain.worker-Ab12Cd34.mjs",
    "https://example.com/assets/terrain.worker-Ab12Cd34.JS",
    "https://example.com/assets/terrain.worker-Ab12Cd34.js/",
    "https://example.com/assets/terrain.worker-%41b12Cd34.js",
  ])("rejects unbundled, unhashed or nonconfigured asset paths %s", (assetUrl) => {
    expect(resolve(assetUrl)).toBeNull();
  });

  it.each(["?worker_file&type=module", "?t=123", "?", "#revision", "#"])(
    "rejects query/fragment syntax including an empty delimiter %s", (suffix) => {
      expect(resolve(`https://example.com/assets/terrain.worker-Ab12Cd34.js${suffix}`))
        .toBeNull();
    }
  );

  it.each(["user@", "user:password@", "@", ":@"])(
    "rejects credential syntax %s", (credentials) => {
      expect(resolve(`https://${credentials}example.com/assets/terrain.worker-Ab12Cd34.js`))
        .toBeNull();
    }
  );

  it.each([
    " https://example.com/assets/terrain.worker-Ab12Cd34.js",
    "https://example.com/assets/terrain.worker-Ab12Cd34.js\n",
    "https://example.com/asse\tts/terrain.worker-Ab12Cd34.js",
    "https://example.com/asse\u0000ts/terrain.worker-Ab12Cd34.js",
    "https://example.com\\assets\\terrain.worker-Ab12Cd34.js",
  ])("does not normalize malformed whitespace or path separators %s", (assetUrl) => {
    expect(resolve(assetUrl)).toBeNull();
  });

  it.each([null, undefined, {}, { assetUrl: 123, production: true }])(
    "fails closed for malformed options %j", (options) => {
      expect(resolveDerivedCacheAssetEpoch(options as DerivedCacheAssetEpochOptions))
        .toBeNull();
    }
  );

  it("does not mutate caller options", () => {
    const options = Object.freeze({
      assetUrl: "https://example.com/assets/terrain.worker-Ab12Cd34.js",
      production: true,
    });
    expect(resolveDerivedCacheAssetEpoch(options)).toBe(options.assetUrl);
  });
});
