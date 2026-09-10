export type DerivedCacheAssetEpochOptions = Readonly<{
  assetUrl: string;
  production: boolean;
}>;

// Only the configured Vite [name]-[hash].js shape, not a generic hash parser.
const VITE_HASHED_JAVASCRIPT_PATH =
  /\/[A-Za-z0-9_.-]+-[A-Za-z0-9_-]{8,}\.js$/;

/** Resolves a producer's immutable asset URL, never a shortened hash suffix.
 * The caller must supply the built top-level producer worker entry URL
 * (WorkerGlobalScope.location.href), not import.meta.url of an unrelated lazy
 * cache/codec chunk. Its build hash must cover the complete producer graph,
 * including inlined WASM; mutable external inputs need their own versioning.
 * URL shape alone cannot prove that the build graph was actually hashed.
 */
export const resolveDerivedCacheAssetEpoch = (
  options: DerivedCacheAssetEpochOptions
): string | null => {
  if (
    options?.production !== true ||
    typeof options.assetUrl !== "string" ||
    /[\s\\?#]/.test(options.assetUrl) ||
    Array.from(options.assetUrl).some((character) => {
      const code = character.charCodeAt(0);
      return code < 0x20 || code === 0x7f;
    })
  ) {
    return null;
  }
  const authority = /^https?:\/\/([^/]+)/i.exec(options.assetUrl)?.[1];
  // Reject even empty credential syntax that URL canonicalization removes.
  if (!authority || authority.includes("@")) return null;
  try {
    const url = new URL(options.assetUrl);
    if (
      url.username || url.password || url.search || url.hash ||
      !VITE_HASHED_JAVASCRIPT_PATH.test(url.pathname)
    ) {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
};
