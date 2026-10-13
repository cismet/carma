import * as THREE from "three";
import { expect, vi } from "vitest";
import { buildSharedThreeSceneLayer } from "./shared-three-scene-layer";
import { type SharedSceneAccumulationController } from "../../core/shared-three-scene-types";

vi.mock("@carma-mapping/engines/threejs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@carma-mapping/engines/threejs")>()),
  synthesizeLodCamera: vi.fn(() => true),
}));

vi.mock(
  "@carma-mapping/engines/three/primitives/rendering",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@carma-mapping/engines/three/primitives/rendering")
    >()),
    buildSharedSceneAccumulator: vi.fn(),
  })
);

vi.mock("three", async (importOriginal) => ({
  ...(await importOriginal<typeof import("three")>()),
  WebGLRenderer: class {
    constructor(private readonly options: { context: unknown }) {}
    getContext = () => this.options.context;
    shadowMap = {};
    setRenderTarget = vi.fn();
    setViewport = vi.fn();
    resetState = vi.fn();
    render = vi.fn();
    dispose = vi.fn();
  },
}));

export const createProgressiveHost = () => {
  const canvas = {
    width: 4400,
    height: 1800,
    clientWidth: 2200,
    clientHeight: 900,
    getBoundingClientRect: () => ({ left: 30, top: 50 }),
  };
  const map = {
    getCanvas: () => canvas,
    getCenter: () => ({ lng: 7.15, lat: 51.25 }),
    project: vi.fn(() => ({ x: 1100, y: 450 })),
    getTerrain: () => null,
    isZooming: vi.fn(() => false),
    unproject: vi.fn(() => ({ lng: 7.15, lat: 51.25 })),
    on: vi.fn(),
    off: vi.fn(),
    triggerRepaint: vi.fn(),
  };
  const hostFramebuffer = {};
  const gl = {
    DEPTH_RANGE: 0x0b70,
    FRAMEBUFFER: 0x8d40,
    FRAMEBUFFER_BINDING: 0x8ca6,
    DEPTH_BUFFER_BIT: 0x00000100,
    getParameter: vi.fn((parameter: number) =>
      parameter === 0x0b70 ? [0, 0.985] : hostFramebuffer
    ),
    bindFramebuffer: vi.fn(),
    depthRange: vi.fn(),
    depthMask: vi.fn(),
    clearDepth: vi.fn(),
    clear: vi.fn(),
  };
  const layer = buildSharedThreeSceneLayer("progressive-host");
  layer.onAdd!(map as never, gl as never);
  const controller: SharedSceneAccumulationController = {
    active: vi.fn(() => true),
    epoch: () => 0,
    visualEpoch: () => 0,
    retainSettledFrame: () => false,
    prepareRound: vi.fn(),
    finishRound: vi.fn(),
    onSettled: vi.fn(),
    onPresented: vi.fn(),
    rounds: 8,
  };
  layer.setAccumulationController(controller);
  const render = () =>
    layer.render(
      gl as never,
      {
        defaultProjectionData: { mainMatrix: new THREE.Matrix4().elements },
      } as never
    );
  return { layer, controller, map, canvas, gl, hostFramebuffer, render };
};

export const expectMatrixToBeCloseTo = (
  actual: THREE.Matrix4,
  expected: THREE.Matrix4
): void => {
  actual.elements.forEach((value, index) => {
    expect(value).toBeCloseTo(expected.elements[index], 10);
  });
};
