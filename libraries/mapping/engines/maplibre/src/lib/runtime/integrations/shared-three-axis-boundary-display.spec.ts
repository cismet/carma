import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import type { Meters } from "@carma-units";
import {
  createSharedThreeAxisBoundaryDisplay,
  type AxisBoundaryDisplayUniforms,
} from "./shared-three-axis-boundary-display";
import type { BestImageAreaCache } from "./best-image-area-cache";
import type { AxisCellCache } from "./shared-three-axis-cell-cache";
import type { SharedThreePhotoDepth } from "./shared-three-photo-depth";
import {
  AXIS_BOUNDARY_FRAGMENT_FUNCTION,
  AXIS_BOUNDARY_FRAGMENT_HEADER,
} from "./shared-three-axis-boundaries";

const site = (id: string, direction = new THREE.Vector3(0, 0, -1)) => ({
  id,
  sceneToImage: new THREE.Matrix4(),
  eye: new THREE.Vector3(0, 0, 10),
  direction,
});

const fixture = () => {
  const cache = {
    setSites: vi.fn(() => true),
    queryBounds: vi.fn(),
    dispose: vi.fn(),
  } as unknown as AxisCellCache;
  const sharedDepth = {
    sync: vi.fn(() => ({ revision: 1, receivers: 1 })),
    renderView: vi.fn(),
  } as unknown as SharedThreePhotoDepth;
  const display = createSharedThreeAxisBoundaryDisplay(
    new Map<string, never>(),
    sharedDepth,
    { cellCache: cache }
  );
  return { display, cache, sharedDepth };
};

describe("shared three axis boundary display", () => {
  it("maps tiled candidate indices into the complete stable camera atlas", () => {
    expect(AXIS_BOUNDARY_FRAGMENT_HEADER).toContain(
      "CARMA_AXIS_BOUNDARY_DISPLAY_INDEXED_PASS"
    );
    expect(AXIS_BOUNDARY_FRAGMENT_HEADER).toContain(
      "carmaAxisBoundaryDisplayIndexCount"
    );
    expect(AXIS_BOUNDARY_FRAGMENT_FUNCTION).toContain(
      "carmaAxisBoundarySourceIndex(site)"
    );
    expect(AXIS_BOUNDARY_FRAGMENT_FUNCTION).toContain(
      "CARMA_AXIS_BOUNDARY_PASS_COUNT > 128"
    );
  });

  it("publishes receiver uniforms and stays disabled until rendered", () => {
    const { display } = fixture();
    const uniforms = display.uniforms as AxisBoundaryDisplayUniforms;

    expect(uniforms.carmaAxisBoundaryDisplayTexture.value).toBeNull();
    expect(uniforms.carmaAxisBoundaryDisplayEnabled.value).toBe(0);
    expect(uniforms.carmaAxisBoundaryDisplaySceneToClip.value).toBeInstanceOf(
      THREE.Matrix4
    );
    const disabledResult = display.render(
      {} as THREE.WebGLRenderer,
      new THREE.PerspectiveCamera(),
      new THREE.Vector2(1920, 1080)
    );
    expect(disabledResult.texture).toBeNull();
    expect(disabledResult.width).toBe(0);
    expect(uniforms.carmaAxisBoundaryDisplayTexture.value).toBeNull();
    display.setStyle({ enabled: true });
    expect(uniforms.carmaAxisBoundaryDisplayEnabled.value).toBe(0);

    display.dispose();
    expect(uniforms.carmaAxisBoundaryDisplayEnabled.value).toBe(0);
  });

  it("updates the full candidate pool and detach preserves an injected cache", () => {
    const { display, cache } = fixture();
    const cameras = Array.from({ length: 140 }, (_, index) =>
      site(`camera-${index}`)
    );

    expect(display.setSites(cameras)).toBe(true);
    expect(cache.setSites).toHaveBeenCalledWith(cameras);
    expect(display.state.sourceCount).toBe(140);
    display.detach();
    expect(display.state.sourceCount).toBe(140);
    expect(cache.dispose).not.toHaveBeenCalled();
    display.dispose();
    expect(cache.dispose).not.toHaveBeenCalled();
  });

  it("changes consumer eligibility without narrowing or owning the shared table", () => {
    const { display, cache } = fixture();
    const cameras = [site("one"), site("other-heading"), site("two")];
    const owner = {
      readField: () => ({
        sites: cameras,
        geometryRevision: 1,
        axisRevision: 1,
      }),
      updateSites: vi.fn(),
      dispose: vi.fn(),
    } as unknown as BestImageAreaCache;
    const first = {
      candidateCache: owner,
      eligibleIds: new Set(["one", "two"]),
    };
    expect(display.setSites([cameras[0], cameras[2]], first)).toBe(true);
    expect(display.setSites([cameras[0], cameras[2]], first)).toBe(false);
    expect(
      display.setSites([cameras[1]], {
        candidateCache: owner,
        eligibleIds: new Set(["other-heading"]),
      })
    ).toBe(true);
    expect(display.state.sourceCount).toBe(3);
    expect(cache.setSites).not.toHaveBeenCalled();
    expect(owner.updateSites).not.toHaveBeenCalled();
    display.dispose();
    expect(owner.dispose).not.toHaveBeenCalled();
  });

  it("does not query or expose an unbounded field without a valid focus", () => {
    const { display, cache } = fixture();
    display.setSites([site("one")]);
    display.setStyle({ enabled: true });

    const result = display.render(
      {} as THREE.WebGLRenderer,
      new THREE.PerspectiveCamera(),
      new THREE.Vector2(1920, 1080)
    );

    expect(result.texture).toBeNull();
    expect(result.pending).toBe(false);
    expect(display.state.active).toBe(false);
    expect(display.state.focusCenter).toBeNull();
    expect(display.state.focusRadiusMeters).toBe(0);
    expect(cache.queryBounds).not.toHaveBeenCalled();

    const invalidFocus = display.render(
      {} as THREE.WebGLRenderer,
      new THREE.PerspectiveCamera(),
      new THREE.Vector2(1920, 1080),
      undefined,
      undefined,
      undefined,
      { center: new THREE.Vector3(Number.NaN, 0, 0) }
    );
    expect(invalidFocus.texture).toBeNull();
    expect(cache.queryBounds).not.toHaveBeenCalled();
    display.dispose();
  });

  it("repaints on candidate and scene-frame changes without React state", () => {
    const repaint = vi.fn();
    const { display, cache } = (() => {
      const cache = {
        setSites: vi.fn(() => true),
        queryBounds: vi.fn(),
        dispose: vi.fn(),
      } as unknown as AxisCellCache;
      const sharedDepth = {
        sync: vi.fn(() => ({ revision: 1, receivers: 0 })),
        renderView: vi.fn(),
      } as unknown as SharedThreePhotoDepth;
      return {
        cache,
        display: createSharedThreeAxisBoundaryDisplay(
          new Map<string, never>(),
          sharedDepth,
          { cellCache: cache, requestRepaint: repaint }
        ),
      };
    })();

    display.setSites([site("one"), site("two")]);
    expect(repaint).toHaveBeenCalled();
    repaint.mockClear();
    expect(
      display.setSceneToMetric(new THREE.Matrix4().makeTranslation(1, 0, 0))
    ).toBe(true);
    expect(repaint).toHaveBeenCalled();
    expect(cache.setSites).toHaveBeenCalledTimes(1);
    display.dispose();
  });

  it.each([false, true])(
    "reuses position capture and stable global indices, restoring draw state (borrowed=%s)",
    async (borrowed) => {
      vi.useFakeTimers();
      const clock = vi.spyOn(performance, "now").mockReturnValue(0);
      const originalViewport = new THREE.Vector4(17, 23, 301, 207);
      const originalScissor = new THREE.Vector4(19, 29, 211, 151);
      const rendererState = {
        target: null as THREE.WebGLRenderTarget | null,
        viewport: originalViewport.clone(),
        scissor: originalScissor.clone(),
        scissorTest: true,
        clearColor: new THREE.Color(0x345678),
        clearAlpha: 0.3,
      };
      const gl = {
        FRAMEBUFFER: 1,
        depthRange: vi.fn(),
        bindFramebuffer: vi.fn(),
      };
      let throwOnFieldDraw = false;
      const renderedIndices: number[][] = [];
      const renderer = {
        autoClear: true,
        capabilities: { maxTextureSize: 4096 },
        extensions: { has: () => true },
        state: { bindFramebuffer: vi.fn() },
        getContext: () => gl,
        getRenderTarget: () => rendererState.target,
        getViewport: (target: THREE.Vector4) =>
          target.copy(rendererState.viewport),
        getScissor: (target: THREE.Vector4) =>
          target.copy(rendererState.scissor),
        getScissorTest: () => rendererState.scissorTest,
        getClearColor: (target: THREE.Color) =>
          target.copy(rendererState.clearColor),
        getClearAlpha: () => rendererState.clearAlpha,
        resetState: vi.fn(),
        setRenderTarget: (target: THREE.WebGLRenderTarget | null) => {
          rendererState.target = target;
          rendererState.viewport.copy(
            target?.viewport ?? new THREE.Vector4(0, 0, 800, 600)
          );
          rendererState.scissor.copy(
            target?.scissor ?? new THREE.Vector4(0, 0, 800, 600)
          );
        },
        setViewport: (target: THREE.Vector4) =>
          rendererState.viewport.copy(target),
        setScissor: (target: THREE.Vector4) =>
          rendererState.scissor.copy(target),
        setScissorTest: (enabled: boolean) => {
          rendererState.scissorTest = enabled;
        },
        setClearColor: (color: THREE.ColorRepresentation, alpha: number) => {
          rendererState.clearColor.set(color);
          rendererState.clearAlpha = alpha;
        },
        clear: vi.fn(),
        render: (scene: THREE.Scene) => {
          const material = (
            scene.children[0] as THREE.Mesh<
              THREE.PlaneGeometry,
              THREE.ShaderMaterial
            >
          ).material;
          const indices = material.uniforms.carmaAxisBoundaryDisplayIndices
            .value as THREE.DataTexture;
          const count = material.uniforms.carmaAxisBoundaryDisplayIndexCount
            .value as number;
          renderedIndices.push(
            Array.from(
              { length: count },
              (_, index) => indices.image.data[index * 4]
            )
          );
          if (throwOnFieldDraw) throw new Error("mock field draw failure");
        },
      } as unknown as THREE.WebGLRenderer;
      let field = {
        sites: borrowed
          ? [site("one"), site("other-heading"), site("two")]
          : [site("one"), site("two")],
        geometryRevision: 1,
        axisRevision: 1,
      };
      const queryBounds = vi.fn(async (_bounds: THREE.Box3 | null) => ({
        ...field,
        indices: new Uint32Array(borrowed ? [0, 1, 2] : [0, 1]),
        metrics: {
          generation: 1,
          sourceCount: field.sites.length,
          candidateCount: field.sites.length,
          cellCount: 1,
          cacheHits: 0,
          cacheMisses: 1,
          fallback: false,
          bvhNodesVisited: 1,
          leafSitesTested: 2,
          indexBytes: 8,
          elapsedMs: 0.1,
        },
      }));
      const cache = {
        setSites: vi.fn(() => true),
        queryBounds: borrowed ? vi.fn() : queryBounds,
        dispose: vi.fn(),
      } as unknown as AxisCellCache;
      const sharedCache = {
        readField: () => field,
        query: queryBounds,
        updateSites: vi.fn(),
        dispose: vi.fn(),
      } as unknown as BestImageAreaCache;
      const binding = borrowed
        ? {
            candidateCache: sharedCache,
            eligibleIds: new Set(["one", "two"]),
          }
        : undefined;
      const sharedDepth = {
        sync: vi.fn(() => ({ revision: 1, receivers: 1 })),
        renderView: vi.fn(() => {
          expect(gl.depthRange).toHaveBeenLastCalledWith(0, 1);
        }),
      } as unknown as SharedThreePhotoDepth;
      const display = createSharedThreeAxisBoundaryDisplay(
        new Map<string, never>(),
        sharedDepth,
        { cellCache: cache }
      );
      const camera = new THREE.OrthographicCamera();
      camera.left = -10_000;
      camera.right = 10_000;
      camera.top = 10_000;
      camera.bottom = -10_000;
      camera.near = 1;
      camera.far = 4_000;
      camera.updateProjectionMatrix();
      const viewport = new THREE.Vector2(64, 64);
      const focus = {
        center: new THREE.Vector3(63, -20, -5),
        radiusMeters: 2_000 as Meters,
      };
      const hostState = {
        framebuffer: null,
        depthRange: [0.2, 0.8] as const,
      };
      display.setSites([site("one"), site("two")], binding);
      display.setStyle({ enabled: true });
      display.render(
        renderer,
        camera,
        viewport,
        hostState,
        undefined,
        {
          revision: 1,
          receivers: 1,
        },
        focus
      );
      expect(display.state.pending).toBe(true);
      clock.mockReturnValue(81);
      await vi.advanceTimersByTimeAsync(81);
      // The settle timer has fired, but the next render has not initialized tiles yet.
      expect(display.state.pending).toBe(true);
      display.render(
        renderer,
        camera,
        viewport,
        hostState,
        undefined,
        {
          revision: 1,
          receivers: 1,
        },
        focus
      );
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      expect(queryBounds).toHaveBeenCalled();
      for (const [bounds] of queryBounds.mock.calls) {
        expect(bounds).toBeInstanceOf(THREE.Box3);
        expect(bounds!.max.x - bounds!.min.x).toBeLessThanOrEqual(2_000.01);
        expect(bounds!.max.y - bounds!.min.y).toBeLessThanOrEqual(2_000.01);
        expect(bounds!.max.z - bounds!.min.z).toBeLessThanOrEqual(2_000.01);
      }
      const cachedQueryCount = queryBounds.mock.calls.length;
      const cachedTileCount = display.state.totalTiles;
      display.render(
        renderer,
        camera,
        viewport,
        hostState,
        undefined,
        { revision: 1, receivers: 1 },
        {
          ...focus,
          center: focus.center.clone().add(new THREE.Vector3(10, -5, 7)),
        }
      );
      expect(queryBounds).toHaveBeenCalledTimes(cachedQueryCount);
      expect(display.state.totalTiles).toBe(cachedTileCount);
      expect(display.state.positionPasses).toBe(1);
      expect(display.state.focusCenter).toEqual([64, 0, 0]);
      expect(display.state.focusRadiusMeters).toBe(1_000);

      expect(renderedIndices.length).toBeGreaterThan(0);
      for (const indices of renderedIndices)
        expect(indices).toEqual(borrowed ? [0, 2] : [0, 1]);
      expect(display.state.sourceCount).toBe(borrowed ? 3 : 2);
      field = {
        ...field,
        sites: [
          site("one", new THREE.Vector3(0.01, 0, -1)),
          ...field.sites.slice(1),
        ],
        axisRevision: 2,
      };
      display.setSites([field.sites[0], site("two")], binding);
      display.render(
        renderer,
        camera,
        viewport,
        hostState,
        undefined,
        {
          revision: 1,
          receivers: 1,
        },
        focus
      );
      clock.mockReturnValue(162);
      display.render(
        renderer,
        camera,
        viewport,
        hostState,
        undefined,
        {
          revision: 1,
          receivers: 1,
        },
        focus
      );
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      throwOnFieldDraw = true;
      expect(() =>
        display.render(
          renderer,
          camera,
          viewport,
          hostState,
          undefined,
          {
            revision: 1,
            receivers: 1,
          },
          focus
        )
      ).toThrow("mock field draw failure");
      expect(sharedDepth.sync).not.toHaveBeenCalled();
      expect(display.state.positionPasses).toBe(1);
      expect(rendererState.target).toBeNull();
      expect(rendererState.viewport.equals(originalViewport)).toBe(true);
      expect(rendererState.scissor.equals(originalScissor)).toBe(true);
      expect(rendererState.scissorTest).toBe(true);
      expect(gl.depthRange).toHaveBeenLastCalledWith(0.2, 0.8);
      display.dispose();
      if (borrowed) {
        expect(cache.setSites).not.toHaveBeenCalled();
        expect(cache.queryBounds).not.toHaveBeenCalled();
        expect(sharedCache.updateSites).not.toHaveBeenCalled();
        expect(sharedCache.dispose).not.toHaveBeenCalled();
      }
      clock.mockRestore();
      vi.useRealTimers();
    }
  );
});
