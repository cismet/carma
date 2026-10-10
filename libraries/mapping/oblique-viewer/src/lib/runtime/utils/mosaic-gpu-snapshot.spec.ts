import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ImageLevelStack, ImageRect } from "@carma-commons/image-pyramid";
import type { Texture, WebGLRenderer } from "three";
import { MosaicGpuSnapshot, mosaicTextureBounds } from "./mosaic-gpu-snapshot";

const state = vi.hoisted(() => ({
  quality: vi.fn(),
  fail: false,
  rect: { x: 0, y: 0, width: 1024, height: 1024 },
  composers: [] as Array<{
    texture: Texture;
    attach: ReturnType<typeof vi.fn>;
    renderToTarget: () => unknown;
    freezeSnapshot: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
  }>,
}));
vi.mock("@carma-commons/image-pyramid", async () => {
  const { Texture } = await import("three");
  return {
    ThreeImageLevels: class {
      texture = new Texture();
      revision = 0;
      attach = vi.fn();
      dispose = vi.fn();
      freezeSnapshot = vi.fn();
      renderToTarget = vi.fn(() => {
        if (state.fail) throw Error("GPU context lost");
        return {
          texture: this.texture,
          revision: ++this.revision,
          rect: state.rect,
        };
      });
      constructor() {
        this.texture.image = { width: 512, height: 512 };
        state.composers.push(this);
      }
    },
  };
});
vi.mock("./mosaic-region-quality", () => ({
  readMosaicRegionQuality: state.quality,
}));
const stack = { rev: 0, available: true } as unknown as ImageLevelStack & {
  rev: number;
  available: boolean;
};
const renderer = {} as WebGLRenderer;
const crop = { x: 100, y: 200, width: 800, height: 600 } as ImageRect;
const size = { width: 400, height: 300 };
beforeEach(() => {
  state.fail = false;
  state.composers.length = 0;
  stack.rev = 0;
  stack.available = true;
  state.quality.mockImplementation(
    (source: typeof stack, _crop: unknown, previous?: { signature: string }) =>
      source.available && previous?.signature !== `${source.rev}`
        ? { signature: `${source.rev}`, tiles: [] }
        : null
  );
});
describe("MosaicGpuSnapshot", () => {
  it("clips the requested crop inside padded GPU coverage with bottom-left texture UVs", () => {
    expect(mosaicTextureBounds(crop, state.rect as ImageRect)).toEqual([
      100 / 1024,
      1 - 800 / 1024,
      900 / 1024,
      1 - 200 / 1024,
    ]);
  });
  it("keeps dirty-tile updates on one composer and carries the actual padded coverage and revision", () => {
    const gpu = new MosaicGpuSnapshot();
    expect(gpu.update(renderer, stack, crop, size)).toBe(true);
    const texture = gpu.result!.texture;
    stack.rev++;
    expect(gpu.update(renderer, stack, crop, size)).toBe(true);
    expect(state.composers).toHaveLength(1);
    expect(gpu.result?.texture).toBe(texture);
    expect(texture.version).toBe(0);
    expect(gpu.result?.revision).toBe(2);
    expect(gpu.result?.rect).toEqual(state.rect);
    expect(gpu.result?.rect).not.toEqual(crop);
    expect(state.composers[0].renderToTarget).toHaveBeenLastCalledWith(
      renderer,
      crop,
      size
    );
    expect(gpu.bytes).toBe(512 * 512 * 8);
    gpu.dispose();
  });
  it("does not attach or repaint parked/lower-quality pixels and retains the frozen snapshot", () => {
    const gpu = new MosaicGpuSnapshot();
    gpu.update(renderer, stack, crop, size);
    const result = gpu.result;
    gpu.freeze();
    gpu.freeze();
    expect(gpu.bytes).toBe(512 * 512 * 4);
    expect(gpu.uses(stack)).toBe(false);
    expect(state.composers[0].freezeSnapshot).toHaveBeenCalledOnce();
    stack.available = false;
    stack.rev++;
    expect(gpu.update(renderer, stack, crop, size)).toBe(false);
    expect(gpu.result).toBe(result);
    expect(state.composers).toHaveLength(1);
    expect(state.composers[0].attach).toHaveBeenCalledOnce();
    expect(state.composers[0].renderToTarget).toHaveBeenCalledOnce();
    gpu.dispose();
  });
  it("uses a new composer after freezing and publishes it only after a successful replacement", () => {
    const gpu = new MosaicGpuSnapshot();
    gpu.update(renderer, stack, crop, size);
    gpu.freeze();
    const previous = gpu.result;
    stack.rev++;
    state.fail = true;
    expect(() => gpu.update(renderer, stack, crop, size)).toThrow(
      "GPU context lost"
    );
    expect(gpu.result).toBe(previous);
    expect(state.composers[0].dispose).not.toHaveBeenCalled();
    expect(state.composers[1].dispose).toHaveBeenCalledOnce();
    state.fail = false;
    expect(gpu.update(renderer, stack, crop, size)).toBe(true);
    expect(gpu.result?.texture).not.toBe(previous?.texture);
    expect(state.composers[0].dispose).toHaveBeenCalledOnce();
    expect(state.composers[2].dispose).not.toHaveBeenCalled();
    gpu.dispose();
    gpu.dispose();
    expect(state.composers[2].dispose).toHaveBeenCalledOnce();
  });
  it("admits actual FBO capacity including a retained snapshot, not just requested output pixels", () => {
    const gpu = new MosaicGpuSnapshot();
    expect(
      gpu.update(renderer, stack, crop, { width: 16, height: 16 }, 2048)
    ).toBe(false);
    expect(gpu.result).toBeNull();
    expect(state.composers[0].dispose).toHaveBeenCalledOnce();
    expect(gpu.update(renderer, stack, crop, size)).toBe(true);
    gpu.freeze();
    const result = gpu.result;
    stack.rev++;
    expect(gpu.update(renderer, stack, crop, size, 512 * 512 * 8)).toBe(false);
    expect(gpu.result).toBe(result);
    expect(gpu.bytes).toBe(512 * 512 * 4);
    expect(state.composers[1].dispose).not.toHaveBeenCalled();
    expect(state.composers[2].dispose).toHaveBeenCalledOnce();
    gpu.dispose();
  });
});
