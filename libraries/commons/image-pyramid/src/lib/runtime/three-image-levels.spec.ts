import { describe, it, expect, vi } from "vitest";
import * as THREE from "three";
import type { ImageLevelStack } from "./image-level-stack";
import type { ImageRect } from "../core/image-level-plan";
import { ThreeImageLevels } from "./three-image-levels";

const setup = (nested: boolean) => {
  const oldTarget = nested ? new THREE.WebGLRenderTarget(8, 8) : null;
  let target = oldTarget;
  const framebuffer = {} as WebGLFramebuffer;
  const gl = {
    FRAMEBUFFER: 1,
    FRAMEBUFFER_BINDING: 2,
    DEPTH_RANGE: 3,
    getParameter: vi.fn((key: number) =>
      key === 2 ? framebuffer : [0.1, 0.9]
    ),
    bindFramebuffer: vi.fn(),
    depthRange: vi.fn(),
  };
  const renderer = {
    capabilities: { maxTextureSize: 4096 },
    autoClear: true,
    getContext: () => gl,
    getRenderTarget: () => target,
    resetState: vi.fn(() => {
      target = null;
    }),
    setRenderTarget: vi.fn((value: THREE.WebGLRenderTarget | null) => {
      target = value;
    }),
    getViewport: (v: THREE.Vector4) => v.set(1, 2, 300, 200),
    getScissor: (v: THREE.Vector4) => v.set(3, 4, 200, 100),
    getScissorTest: () => true,
    getClearColor: (c: THREE.Color) => c.setRGB(0.1, 0.2, 0.3),
    getClearAlpha: () => 0.4,
    setViewport: vi.fn(),
    setScissor: vi.fn(),
    setScissorTest: vi.fn(),
    setClearColor: vi.fn(),
    clear: vi.fn(),
    render: vi.fn(),
  };
  const composer = new ThreeImageLevels();
  composer.attach({
    plan: { layers: [] },
    pyramid: { native: { width: 64, height: 64 }, levels: [] },
    onContentChange: () => () => {},
    onEvict: () => () => {},
  } as unknown as ImageLevelStack);
  const draw = (explicit: boolean) =>
    composer.renderToTarget(
      renderer as unknown as THREE.WebGLRenderer,
      { x: 0, y: 0, width: 64, height: 64 } as ImageRect,
      { width: 64, height: 64 },
      explicit ? { framebuffer, depthRange: [0.1, 0.9] } : undefined
    );
  return {
    composer,
    renderer,
    gl,
    draw,
    oldTarget,
    framebuffer,
    dispose: () => {
      composer.dispose();
      oldTarget?.dispose();
    },
  };
};
describe("image composer explicit host state", () => {
  it("keeps many fixed ROI snapshots within their output budget instead of allocating each complete source cell", () => {
    const h = setup(false);
    const bitmap = { width: 1024, height: 1024 } as ImageBitmap;
    const stack = {
      plan: { target: 1, layers: [1] },
      pyramid: {
        native: { width: 4096, height: 4096 },
        levels: [
          {
            level: 1,
            nativeScale: { x: 2, y: 2 },
            width: 2048,
            height: 2048,
            tileWidth: 1024,
            tileHeight: 1024,
            cols: 2,
            rows: 2,
          },
        ],
      },
      tile: () => bitmap,
      isResident: () => true,
      onContentChange: () => () => {},
      onEvict: () => () => {},
    } as unknown as ImageLevelStack;
    const composers: ThreeImageLevels[] = [];
    let retainedBytes = 0;
    for (let index = 0; index < 48; index++) {
      const composer = new ThreeImageLevels();
      composers.push(composer);
      composer.attach(stack);
      const crop = {
        x: 100 + (index % 8) * 40,
        y: 100 + Math.floor(index / 8) * 40,
        width: 100,
        height: 80,
      } as ImageRect;
      const result = composer.renderToTarget(
        h.renderer as unknown as THREE.WebGLRenderer,
        crop,
        { width: 50, height: 40 },
        undefined,
        "region"
      )!;
      const size = result.texture.image as { width: number; height: number };
      expect(size).toMatchObject({ width: 256, height: 256 });
      expect(result.rect).toMatchObject({
        x: crop.x,
        y: crop.y,
        width: 512,
        height: 512,
      });
      retainedBytes += size.width * size.height * 4;
      expect(composer.freezeSnapshot()!.texture).toBe(result.texture);
    }
    expect(retainedBytes).toBe(12 * 1024 * 1024);
    h.composer.attach(stack);
    const regular = h.composer.renderToTarget(
      h.renderer as unknown as THREE.WebGLRenderer,
      { x: 100, y: 100, width: 100, height: 80 } as ImageRect,
      { width: 50, height: 40 }
    )!;
    expect(regular.texture.image).toMatchObject({ width: 1024, height: 1024 });
    // The old per-patch allocation would exhaust 128 MiB before covering all 48 ROIs.
    expect(48 * 1024 * 1024 * 4).toBeGreaterThan(128 * 1024 * 1024);
    composers.forEach((composer) => composer.dispose());
    h.dispose();
  });

  it("renders an independent query plan without changing the primary stack plan", () => {
    const h = setup(false);
    const primary = { target: 2, layers: [2] };
    const fine = { width: 64, height: 64 } as ImageBitmap;
    const coarse = { width: 32, height: 32 } as ImageBitmap;
    const stack = {
      plan: primary,
      pyramid: {
        native: { width: 64, height: 64 },
        levels: [1, 2].map((level) => ({
          level,
          width: 128 / 2 ** level,
          height: 128 / 2 ** level,
          tileWidth: 128 / 2 ** level,
          tileHeight: 128 / 2 ** level,
          cols: 1,
          rows: 1,
        })),
      },
      tile: (level: number) => (level === 1 ? fine : coarse),
      isResident: () => true,
      onContentChange: () => () => {},
      onEvict: () => () => {},
    } as unknown as ImageLevelStack;
    const query: NonNullable<ImageLevelStack["plan"]> = {
      target: 1,
      underlay: 2,
      floor: 2,
      finer: null,
      layers: [2, 1],
      visibleTarget: { level: 1, col0: 0, col1: 0, row0: 0, row1: 0 },
      scale: () => 1,
      wants: [],
      decodedBytes: 0,
    };
    const drawn: unknown[][] = [];
    h.renderer.render.mockImplementation((scene) => {
      drawn.push(
        scene.children
          .filter((mesh: THREE.Mesh) => mesh.visible)
          .map(
            (mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>) =>
              mesh.material.uniforms.map.value.image
          )
      );
    });
    h.composer.attach(stack, query);
    h.draw(false);
    expect(drawn.at(-1)).toEqual([coarse, fine]);
    expect(stack.plan).toBe(primary);
    h.composer.attach(stack);
    h.draw(false);
    expect(drawn.at(-1)).toEqual([coarse]);
    expect(stack.plan).toBe(primary);
    h.dispose();
  });
  it.each([false, true])(
    "restores host or nested target without blocking queries, nested=%s",
    (nested) => {
      const f = setup(nested);
      try {
        f.draw(true);
        expect(f.gl.getParameter).not.toHaveBeenCalled();
        expect(f.renderer.getRenderTarget()).toBe(f.oldTarget);
        expect(f.gl.depthRange).toHaveBeenLastCalledWith(
          ...(nested ? [0, 1] : [0.1, 0.9])
        );
        if (nested) expect(f.gl.bindFramebuffer).not.toHaveBeenCalled();
        else
          expect(f.gl.bindFramebuffer).toHaveBeenLastCalledWith(
            1,
            f.framebuffer
          );
        expect(f.renderer.autoClear).toBe(true);
      } finally {
        f.dispose();
      }
    }
  );
  it("preserves standalone fallback and restores target after drawing fails", () => {
    const f = setup(false);
    try {
      f.renderer.clear.mockImplementationOnce(() => {
        throw Error("draw failed");
      });
      expect(() => f.draw(false)).toThrow("draw failed");
      expect(f.gl.getParameter.mock.calls).toEqual([[2], [3]]);
      expect(f.renderer.getRenderTarget()).toBe(null);
      expect(f.gl.bindFramebuffer).toHaveBeenLastCalledWith(1, f.framebuffer);
      expect(f.gl.depthRange).toHaveBeenLastCalledWith(0.1, 0.9);
    } finally {
      f.dispose();
    }
  });
});

it("restores the explicit host through Three's public framebuffer cache", () => {
  const f = setup(false);
  const bindFramebuffer = vi.fn();
  Object.assign(f.renderer, { state: { bindFramebuffer } });
  try {
    f.draw(true);
    expect(bindFramebuffer).toHaveBeenLastCalledWith(
      f.gl.FRAMEBUFFER,
      f.framebuffer
    );
    expect(f.gl.bindFramebuffer).not.toHaveBeenCalled();
    expect(f.gl.getParameter).not.toHaveBeenCalled();
  } finally {
    f.dispose();
  }
});

describe("stable tile coverage and incremental GPU output", () => {
  const tiled = (layers: number[] = [2, 1]) => {
    const harness = setup(false);
    let publish:
      | ((change?: {
          tile?: { level: number; col: number; row: number };
          reset?: boolean;
        }) => void)
      | undefined;
    const bitmaps = new Map<string, ImageBitmap>();
    for (let row = 0; row < 2; row++)
      for (let col = 0; col < 3; col++)
        bitmaps.set(`2:${col}:${row}`, {
          width: 256,
          height: 256,
        } as ImageBitmap);
    const stack = {
      plan: { target: 1, layers },
      pyramid: {
        native: { width: 1536, height: 1024 },
        levels: [
          {
            level: 1,
            width: 1536,
            height: 1024,
            tileWidth: 512,
            tileHeight: 512,
            cols: 3,
            rows: 2,
          },
          {
            level: 2,
            width: 768,
            height: 512,
            tileWidth: 256,
            tileHeight: 256,
            cols: 3,
            rows: 2,
          },
        ],
      },
      tile: (level: number, col: number, row: number) =>
        bitmaps.get(`${level}:${col}:${row}`),
      isResident: (level: number, col: number, row: number) =>
        bitmaps.has(`${level}:${col}:${row}`),
      onContentChange: (callback: typeof publish) => {
        publish = callback;
        return () => {};
      },
      onEvict: () => () => {},
    } as unknown as ImageLevelStack;
    harness.composer.attach(stack);
    const render = (x = 0, y = 0) =>
      harness.composer.renderToTarget(
        harness.renderer as unknown as THREE.WebGLRenderer,
        { x, y, width: 1200, height: 600 } as ImageRect,
        { width: 1200, height: 600 }
      );
    return {
      ...harness,
      render,
      bitmaps,
      publish: (change: Parameters<NonNullable<typeof publish>>[0]) =>
        publish!(change),
    };
  };

  it("renders a resident coarse generation even when only L1 belongs to the query plan", () => {
    const h = tiled([1]);
    const draws: ImageBitmap[][] = [];
    h.renderer.render.mockImplementation((scene) => {
      draws.push(
        scene.children
          .filter((mesh: THREE.Mesh) => mesh.visible)
          .map(
            (mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>) =>
              mesh.material.uniforms.map.value.image
          )
      );
    });
    try {
      h.render();
      expect(draws.at(-1)).toHaveLength(6);
      expect(draws.at(-1)).toEqual([...h.bitmaps.values()]);
    } finally {
      h.dispose();
    }
  });

  it("keeps both render targets valid when the first unplanned intermediate becomes resident", () => {
    const h = tiled([1]);
    h.bitmaps.clear();
    try {
      const front = h.render()!;
      // Prime the alternate target without making any coarser level resident.
      h.publish({ tile: { level: 1, col: 0, row: 0 } });
      const back = h.render()!;
      expect(back.texture).not.toBe(front.texture);
      h.renderer.setScissor.mockClear();
      h.bitmaps.set("2:1:0", { width: 256, height: 256 } as ImageBitmap);
      h.publish({ tile: { level: 2, col: 1, row: 0 } });
      const refined = h.render()!;
      expect(refined.texture).toBe(front.texture);
      const clips = h.renderer.setScissor.mock.calls.filter(
        (call) => typeof call[0] === "number"
      );
      expect(clips.length).toBeGreaterThan(0);
      expect(clips.every((clip) => clip[2] < 1536 && clip[3] < 768)).toBe(true);
      expect(refined.revision).toBeGreaterThan(back.revision);
    } finally {
      h.dispose();
    }
  });

  it("keeps the same texture and coverage during a pan inside its padded cells", () => {
    const h = tiled();
    const first = h.render()!;
    const renders = h.renderer.render.mock.calls.length;
    const second = h.render(30, 40)!;
    expect(second.texture).toBe(first.texture);
    expect(second.rect).toBe(first.rect);
    expect(second.rect.x).toBe(0);
    expect(second.rect.width).toBeGreaterThanOrEqual(1230);
    expect(h.renderer.render).toHaveBeenCalledTimes(renders);
    h.composer.dispose();
  });

  it("updates a changed cell through a bounded scissor while retaining both targets", () => {
    const h = tiled();
    const first = h.render()!;
    h.publish({ tile: { level: 2, col: 0, row: 0 } });
    const second = h.render()!;
    expect(second.texture).not.toBe(first.texture);
    h.renderer.setScissor.mockClear();
    h.bitmaps.set("1:0:0", { width: 512, height: 512 } as ImageBitmap);
    h.publish({ tile: { level: 1, col: 0, row: 0 } });
    const third = h.render()!;
    expect(third.texture).toBe(first.texture);
    const clips = h.renderer.setScissor.mock.calls.filter(
      (call) => typeof call[0] === "number"
    );
    expect(clips.length).toBeGreaterThan(0);
    for (const clip of clips) {
      expect(clip[2]).toBeLessThan(1536);
      expect(clip[3]).toBeLessThan(768);
    }
    expect(h.gl.depthRange).toHaveBeenLastCalledWith(0.1, 0.9);
    h.composer.dispose();
  });

  it("freezes the current GPU snapshot and frees the unused ping-pong target", () => {
    const h = tiled();
    const first = h.render()!;
    h.publish({ tile: { level: 2, col: 0, row: 0 } });
    const second = h.render()!;
    const firstTarget = h.renderer.setRenderTarget.mock.calls
      .map((call) => call[0])
      .find((target) => target?.texture === first.texture)!;
    const dispose = vi.spyOn(firstTarget, "dispose");
    const frozen = h.composer.freezeSnapshot()!;
    expect(frozen.texture).toBe(second.texture);
    expect(dispose).toHaveBeenCalledOnce();
    const calls = h.renderer.render.mock.calls.length;
    h.publish({ tile: { level: 1, col: 0, row: 0 } });
    expect(h.render()).toBeNull();
    expect(h.renderer.render).toHaveBeenCalledTimes(calls);
    h.composer.dispose();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("clears the cached tile coverage after a reset or a pan beyond its extent", () => {
    const h = tiled();
    const first = h.render()!;
    h.render(600, 0);
    expect(h.renderer.clear).toHaveBeenCalled();
    h.publish({ reset: true });
    const restored = h.render()!;
    expect(restored.revision).toBeGreaterThan(first.revision);
    h.composer.dispose();
  });
});

it("uses the original image edge for native padded-cell UVs", () => {
  const h = setup(false);
  const bitmap = { width: 256, height: 256 } as ImageBitmap;
  h.composer.attach({
    plan: { target: 3, layers: [3] },
    pyramid: {
      native: { width: 7102, height: 5326 },
      levels: [
        {
          level: 3,
          width: 1776,
          height: 1332,
          tileWidth: 256,
          tileHeight: 256,
          cols: 7,
          rows: 6,
          nativeScale: { x: 4, y: 4 },
        },
      ],
    },
    tile: (_level: number, col: number, row: number) =>
      col === 6 && row === 5 ? bitmap : undefined,
    isResident: () => true,
    onContentChange: () => () => {},
    onEvict: () => () => {},
  } as unknown as ImageLevelStack);
  let uv: THREE.Vector2 | undefined;
  h.renderer.render.mockImplementation((scene) => {
    const mesh = scene.children.find(
      (item: THREE.Mesh) => item.visible
    ) as THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
    uv = (mesh.material.uniforms.uvScale.value as THREE.Vector2).clone();
  });
  h.composer.renderToTarget(
    h.renderer as unknown as THREE.WebGLRenderer,
    { x: 6144, y: 5120, width: 958, height: 206 } as ImageRect,
    { width: 958, height: 206 }
  );
  expect(uv?.x).toBe(958 / 1024);
  expect(uv?.y).toBe(206 / 1024);
  h.dispose();
});
