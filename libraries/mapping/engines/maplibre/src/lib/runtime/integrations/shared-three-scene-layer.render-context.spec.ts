import { createProgressiveHost } from "./shared-three-scene-layer.test-support";
import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import {
  installRenderTargetDepthRangeBridge,
  captureSharedThreeHostRenderState,
} from "./shared-three-scene-render-context";

describe("shared three scene layer.render context", () => {
  it.each([
    {
      label: "clean cached depth",
      cache: { dirty: false, current: [0, 0.75] },
      expected: [0, 0.75],
      reads: 0,
    },
    {
      label: "dirty depth cache",
      cache: { dirty: true, current: [0, 0.75] },
      expected: [0, 0.985],
      reads: 1,
    },
    {
      label: "missing depth cache",
      cache: undefined,
      expected: [0, 0.985],
      reads: 1,
    },
  ])("preserves host depth with $label", ({ cache, expected, reads }) => {
    const host = createProgressiveHost();
    Object.assign(host.map, { painter: { context: { depthRange: cache } } });
    host.layer.setAccumulationController(null);
    host.gl.getParameter.mockClear();
    host.gl.depthRange.mockClear();
    try {
      host.render();
      expect(
        host.gl.getParameter.mock.calls.filter(
          ([parameter]) => parameter === host.gl.DEPTH_RANGE
        )
      ).toHaveLength(reads);
      expect(host.gl.depthRange.mock.calls[0]).toEqual(expected);
      expect(host.gl.depthRange).toHaveBeenLastCalledWith(...expected);
    } finally {
      host.layer.dispose();
    }
  });

  it("uses canonical depth for offscreen targets and MapLibre depth on main", () => {
    const events: string[] = [];
    const hostFramebuffer = {} as WebGLFramebuffer;
    let activeFramebuffer: WebGLFramebuffer | null = hostFramebuffer;
    const originalSetRenderTarget = vi.fn((target: unknown) => {
      events.push(target === null ? "target:main" : "target:offscreen");
      activeFramebuffer = target === null ? null : (target as WebGLFramebuffer);
    });
    const renderer = {
      setRenderTarget: originalSetRenderTarget,
    } as unknown as Pick<THREE.WebGLRenderer, "setRenderTarget">;
    const gl = {
      FRAMEBUFFER: 0x8d40,
      FRAMEBUFFER_BINDING: 0x8ca6,
      getParameter: vi.fn(() => activeFramebuffer),
      bindFramebuffer: vi.fn(
        (_target: number, framebuffer: WebGLFramebuffer | null) => {
          activeFramebuffer = framebuffer;
          events.push(
            framebuffer === hostFramebuffer
              ? "framebuffer:host"
              : "framebuffer:other"
          );
        }
      ),
      depthRange: vi.fn((near: number, far: number) => {
        events.push(`depth:${near}:${far}`);
      }),
    };
    const bridge = installRenderTargetDepthRangeBridge(renderer, gl);

    bridge.render([0, 0.985], () => {
      renderer.setRenderTarget({} as THREE.WebGLRenderTarget);
      renderer.setRenderTarget(null);
      expect(activeFramebuffer).toBe(hostFramebuffer);
    });

    expect(events).toEqual([
      "target:offscreen",
      "depth:0:1",
      "target:main",
      "framebuffer:host",
      "depth:0:0.985",
      "framebuffer:host",
      "depth:0:0.985",
    ]);
    expect(activeFramebuffer).toBe(hostFramebuffer);

    bridge.dispose();
    renderer.setRenderTarget(null);
    expect(originalSetRenderTarget).toHaveBeenCalledTimes(3);
    expect(gl.depthRange).toHaveBeenCalledTimes(3);
  });

  it("restores nested host targets through Three's cache even when capture throws", () => {
    const host = {} as WebGLFramebuffer;
    const outerTarget = {} as THREE.WebGLRenderTarget;
    const innerTarget = {} as THREE.WebGLRenderTarget;
    let bound: unknown = host;
    let cached: unknown = null;
    const gl = {
      FRAMEBUFFER: 0x8d40,
      FRAMEBUFFER_BINDING: 0x8ca6,
      getParameter: vi.fn(() => bound),
      bindFramebuffer: vi.fn((_target: number, framebuffer: unknown) => {
        bound = framebuffer;
      }),
      depthRange: vi.fn(),
    };
    const state = {
      bindFramebuffer: vi.fn(
        (target: number, framebuffer: WebGLFramebuffer | null) => {
          if (cached === framebuffer) return;
          gl.bindFramebuffer(target, framebuffer);
          cached = framebuffer;
        }
      ),
    };
    const original = vi.fn((target: THREE.WebGLRenderTarget | null) => {
      state.bindFramebuffer(
        gl.FRAMEBUFFER,
        target as unknown as WebGLFramebuffer | null
      );
    });
    const renderer = { setRenderTarget: original, state };
    const bridge = installRenderTargetDepthRangeBridge(renderer, gl);
    const failure = new Error("capture failed");

    expect(() =>
      bridge.render([0, 0.985], () => {
        renderer.setRenderTarget(outerTarget);
        expect(() =>
          bridge.render([0, 1], () => {
            renderer.setRenderTarget(innerTarget);
            renderer.setRenderTarget(null);
            expect(bound).toBe(outerTarget);
            expect(cached).toBe(outerTarget);
            expect(gl.depthRange).toHaveBeenLastCalledWith(0, 1);
            throw failure;
          })
        ).toThrow(failure);
        expect(bound).toBe(outerTarget);
        renderer.setRenderTarget(null);
        expect(bound).toBe(host);
        expect(cached).toBe(host);
        expect(gl.depthRange).toHaveBeenLastCalledWith(0, 0.985);
        renderer.setRenderTarget(innerTarget);
        throw failure;
      })
    ).toThrow(failure);

    expect(bound).toBe(host);
    expect(cached).toBe(host);
    expect(gl.depthRange).toHaveBeenLastCalledWith(0, 0.985);
    const depthCalls = gl.depthRange.mock.calls.length;
    renderer.setRenderTarget(null);
    expect(bound).toBeNull();
    expect(gl.depthRange).toHaveBeenCalledTimes(depthCalls);
    bridge.dispose();
    expect(renderer.setRenderTarget).toBe(original);
  });
});

describe("explicit frame host state", () => {
  it("captures clean cached framebuffer and depth before callbacks without synchronous GL reads", () => {
    const host = createProgressiveHost();
    const framebuffer = {} as WebGLFramebuffer;
    Object.assign(host.map, {
      painter: {
        context: {
          depthRange: { dirty: false, current: [0, 0.75] },
          bindFramebuffer: { dirty: false, current: framebuffer },
        },
      },
    });
    let captured: unknown;
    host.layer.addBeforeRenderCallback?.((frame) => {
      captured = frame.hostRenderState;
    });
    host.layer.setAccumulationController(null);
    host.gl.getParameter.mockClear();
    try {
      host.render();
      expect(captured).toEqual({ framebuffer, depthRange: [0, 0.75] });
      expect(
        host.gl.getParameter.mock.calls.filter(
          ([key]) =>
            key === host.gl.FRAMEBUFFER_BINDING || key === host.gl.DEPTH_RANGE
        )
      ).toHaveLength(0);
    } finally {
      host.layer.dispose();
    }
  });
  it("accepts a clean null framebuffer and independently reads unknown or dirty caches", () => {
    const framebuffer = {} as WebGLFramebuffer;
    const gl = {
      DEPTH_RANGE: 1,
      FRAMEBUFFER_BINDING: 2,
      getParameter: vi.fn((key: number) =>
        key === 1 ? [0.1, 0.9] : framebuffer
      ),
    };
    expect(
      captureSharedThreeHostRenderState(
        {
          depthRange: { current: [0, 1], dirty: false },
          bindFramebuffer: { current: null, dirty: false },
        },
        gl
      )
    ).toEqual({ framebuffer: null, depthRange: [0, 1] });
    expect(gl.getParameter).not.toHaveBeenCalled();
    expect(
      captureSharedThreeHostRenderState(
        {
          depthRange: { current: [0, 1], dirty: true },
          bindFramebuffer: { current: null, dirty: true },
        },
        gl
      )
    ).toEqual({ framebuffer, depthRange: [0.1, 0.9] });
    expect(gl.getParameter.mock.calls).toEqual([[1], [2]]);
    gl.getParameter.mockClear();
    captureSharedThreeHostRenderState(undefined, gl);
    expect(gl.getParameter.mock.calls).toEqual([[1], [2]]);
  });
  it("restores supplied host framebuffer after a throwing bridge pass without reading GL", () => {
    const framebuffer = {} as WebGLFramebuffer;
    const renderer = { setRenderTarget: vi.fn() } as unknown as Pick<
      THREE.WebGLRenderer,
      "setRenderTarget"
    >;
    const gl = {
      FRAMEBUFFER: 1,
      FRAMEBUFFER_BINDING: 2,
      getParameter: vi.fn(() => {
        throw Error("unexpected sync read");
      }),
      bindFramebuffer: vi.fn(),
      depthRange: vi.fn(),
    };
    const bridge = installRenderTargetDepthRangeBridge(renderer, gl);
    try {
      expect(() =>
        bridge.render(
          [0, 0.8],
          () => {
            renderer.setRenderTarget(new THREE.WebGLRenderTarget(1, 1));
            throw Error("draw failed");
          },
          { framebuffer, depthRange: [0, 0.8] }
        )
      ).toThrow("draw failed");
      expect(gl.getParameter).not.toHaveBeenCalled();
      expect(gl.bindFramebuffer).toHaveBeenLastCalledWith(1, framebuffer);
      expect(gl.depthRange).toHaveBeenLastCalledWith(0, 0.8);
    } finally {
      bridge.dispose();
    }
  });
});
