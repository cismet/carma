import {
  ThreeImageLevels,
  type ImageLevelsTexture,
  type ImageLevelStack,
  type ImageRect,
} from "@carma-commons/image-pyramid";
import type { WebGLRenderer } from "three";
import {
  readMosaicRegionQuality,
  type MosaicRegionQuality,
} from "./mosaic-region-quality";

/** Owns one complete GPU snapshot independently of the decoded source lease. */
export class MosaicGpuSnapshot {
  private composer?: ThreeImageLevels;
  private source?: ImageLevelStack;
  private pixels: ImageLevelsTexture | null = null;
  private receipt?: MosaicRegionQuality;
  private frozen = false;

  get result() {
    return this.pixels;
  }
  get quality() {
    return this.receipt;
  }
  get bytes() {
    const image = this.pixels?.texture.image as
      | { width: number; height: number }
      | undefined;
    return image ? image.width * image.height * 4 * (this.frozen ? 1 : 2) : 0;
  }
  uses(stack: ImageLevelStack) {
    return this.source === stack;
  }

  update(
    renderer: WebGLRenderer,
    stack: ImageLevelStack,
    crop: ImageRect,
    size: { width: number; height: number },
    maxBytes = Infinity
  ): boolean {
    // Parking/eviction must never turn a previously complete region transparent
    // or erase finer detail. Do not even attach the source until this passes.
    const quality = readMosaicRegionQuality(stack, crop, this.receipt);
    if (!quality) return false;
    const previous = this.composer;
    const reusable = previous && !this.frozen && this.source === stack;
    if (reusable && this.bytes > maxBytes) return false;
    const composer = reusable ? previous : new ThreeImageLevels();
    try {
      composer.attach(stack);
      const result = composer.renderToTarget(renderer, crop, size);
      if (!result) {
        if (!reusable) composer.dispose();
        return false;
      }
      const image = result.texture.image as { width: number; height: number };
      const bytes = image.width * image.height * 8;
      if (bytes + (reusable ? 0 : this.bytes) > maxBytes) {
        if (!reusable) composer.dispose();
        return false;
      }
      this.composer = composer;
      this.source = stack;
      this.pixels = result;
      this.receipt = quality;
      this.frozen = false;
      if (previous && !reusable) previous.dispose();
      return true;
    } catch (error) {
      if (!reusable) composer.dispose();
      throw error;
    }
  }
  freeze() {
    if (!this.composer || this.frozen) return;
    this.composer.freezeSnapshot();
    this.source = undefined;
    this.frozen = true;
  }
  dispose() {
    this.composer?.dispose();
    this.composer = undefined;
    this.source = undefined;
    this.pixels = null;
    this.receipt = undefined;
  }
}

/** Valid requested image region inside tile-aligned FBO coverage; UV y is up. */
export const mosaicTextureBounds = (
  crop: ImageRect,
  coverage: ImageRect
): readonly [number, number, number, number] => {
  const unit = (value: number) => Math.max(0, Math.min(1, value));
  return [
    unit((crop.x - coverage.x) / coverage.width),
    unit(1 - (crop.y + crop.height - coverage.y) / coverage.height),
    unit((crop.x + crop.width - coverage.x) / coverage.width),
    unit(1 - (crop.y - coverage.y) / coverage.height),
  ];
};
