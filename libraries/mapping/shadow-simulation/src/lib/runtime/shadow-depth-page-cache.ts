import type * as THREE from "three";

type Entry = Readonly<{
  pageId: string;
  variantId: string;
  target: THREE.RenderTarget;
  bytes: number;
}>;

export const disposeShadowDepthPage = (target: THREE.RenderTarget) => {
  target.depthTexture?.dispose();
  target.dispose();
};

/** PCF directional target in the installed Three renderer: RGBA8 + depth32.
 * Count BOTH attachments, even when the colour payload isn't used for sampling.
 */
export const shadowDepthPageBytes = (width: number, height: number) =>
  width * height * 8;

/** Bounded sample-page admission, not a circular LRU scan. If a full disc does
 * not fit, retain a reusable subset and stream the rest; cyclic LRU would miss
 * every sample on the next pass. One largest in-flight target is reserved.
 */
export class ShadowDepthPageCache {
  private entries = new Map<string, Entry>();
  private retainedBytes = 0;
  private capacityBytes = 0;
  private activeVariantIds: ReadonlySet<string> | null = null;
  hits = 0;
  misses = 0;

  get bytes() {
    return this.retainedBytes;
  }
  get count() {
    return this.entries.size;
  }
  get availableBytes() {
    return Math.max(0, this.capacityBytes - this.retainedBytes);
  }

  /** Planning/idle progress must not inflate foreground cache hit counters. */
  has(key: string) {
    return this.entries.has(key);
  }

  setActiveVariants(variantIds: ReadonlySet<string>) {
    this.activeVariantIds = variantIds;
  }

  setBudget(totalBytes: number, scratchBytes: number) {
    this.capacityBytes = Math.max(0, totalBytes - scratchBytes);
    this.evictInactive(0);
    for (const key of this.entries.keys()) {
      if (this.retainedBytes <= this.capacityBytes) break;
      this.remove(key);
    }
  }

  get(key: string) {
    const entry = this.entries.get(key);
    if (entry) this.hits += 1;
    else this.misses += 1;
    return entry?.target;
  }

  /** Returns ownership to the caller when the target must be streamed. */
  admit(
    key: string,
    pageId: string,
    target: THREE.RenderTarget,
    variantId = pageId,
    options: { evictInactive?: boolean } = {}
  ): boolean {
    if (this.entries.has(key)) return false;
    const bytes = shadowDepthPageBytes(target.width, target.height);
    if (bytes > this.capacityBytes) return false;
    if (options.evictInactive !== false && this.activeVariantIds?.has(variantId))
      this.evictInactive(bytes);
    if (this.retainedBytes + bytes > this.capacityBytes) return false;
    this.entries.set(key, { pageId, variantId, target, bytes });
    this.retainedBytes += bytes;
    return true;
  }

  invalidate(pageId: string) {
    for (const [key, entry] of this.entries) {
      if (entry.pageId === pageId) this.remove(key);
    }
  }

  clear() {
    for (const key of this.entries.keys()) this.remove(key);
  }

  private evictInactive(requiredBytes: number) {
    if (!this.activeVariantIds) return;
    for (const [key, entry] of this.entries) {
      if (this.retainedBytes + requiredBytes <= this.capacityBytes) break;
      if (!this.activeVariantIds.has(entry.variantId)) this.remove(key);
    }
  }

  private remove(key: string) {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.entries.delete(key);
    this.retainedBytes -= entry.bytes;
    disposeShadowDepthPage(entry.target);
  }
}
