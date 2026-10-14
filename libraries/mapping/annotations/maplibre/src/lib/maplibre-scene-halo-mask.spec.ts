import { describe, expect, it, vi } from "vitest";
import {
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  Raycaster,
  RingGeometry,
  Vector3,
  type Material,
  type WebGLRenderer,
} from "three";
import type { MapLibreAnnotationScene } from "./maplibre-annotation-scene.types";
import {
  disposeMapLibreSceneHaloMask,
  getMapLibreSceneHaloMask,
} from "./maplibre-scene-halo-mask";
import { createLineHaloMaterial } from "./maplibre-scene-line-materials";

const stencilProperties = (material: Material) => ({
  stencilWrite: material.stencilWrite,
  stencilWriteMask: material.stencilWriteMask,
  stencilRef: material.stencilRef,
  stencilFunc: material.stencilFunc,
  stencilFuncMask: material.stencilFuncMask,
  stencilFail: material.stencilFail,
  stencilZFail: material.stencilZFail,
  stencilZPass: material.stencilZPass,
});

/** Stateful framebuffer model: stencil content is independent of GL state. */
const createHost = () => {
  const names = [
    "READ_FRAMEBUFFER",
    "DRAW_FRAMEBUFFER",
    "READ_FRAMEBUFFER_BINDING",
    "DRAW_FRAMEBUFFER_BINDING",
    "RENDERBUFFER",
    "RENDERBUFFER_BINDING",
    "SCISSOR_TEST",
    "STENCIL_TEST",
    "STENCIL_BITS",
    "SAMPLES",
    "DEPTH_BITS",
    "STENCIL_CLEAR_VALUE",
    "STENCIL_FUNC",
    "STENCIL_REF",
    "STENCIL_VALUE_MASK",
    "STENCIL_FAIL",
    "STENCIL_PASS_DEPTH_FAIL",
    "STENCIL_PASS_DEPTH_PASS",
    "STENCIL_WRITEMASK",
    "STENCIL_BACK_FUNC",
    "STENCIL_BACK_REF",
    "STENCIL_BACK_VALUE_MASK",
    "STENCIL_BACK_FAIL",
    "STENCIL_BACK_PASS_DEPTH_FAIL",
    "STENCIL_BACK_PASS_DEPTH_PASS",
    "STENCIL_BACK_WRITEMASK",
    "FRONT",
    "BACK",
    "DEPTH24_STENCIL8",
    "DEPTH32F_STENCIL8",
    "DEPTH_STENCIL_ATTACHMENT",
    "FRAMEBUFFER_COMPLETE",
    "STENCIL_BUFFER_BIT",
    "NEAREST",
    "NONE",
  ];
  const enums = Object.fromEntries(
    names.map((name, index) => [name, index + 1])
  ) as Record<string, number>;
  const originalDraw = { id: "internal-maplibre-host" },
    originalRead = { id: "unrelated-read-fbo" },
    originalBuffer = { id: "unrelated-renderbuffer" };
  let read = originalRead,
    draw = originalDraw,
    buffer = originalBuffer,
    nextId = 0;
  const originalBytes = Uint8Array.from([0xff, 0xaa, 0x11, 0x7f]);
  const bytes = new Map<object, Uint8Array>([
    [originalDraw, originalBytes.slice()],
    [originalRead, Uint8Array.from([1, 2, 3, 4])],
  ]);
  const valid = new Set<object>([originalDraw, originalRead]);
  const enabled = new Set<number>([enums.SCISSOR_TEST]);
  const params = new Map<number, number>([
    [enums.STENCIL_BITS, 8],
    [enums.SAMPLES, 0],
    [enums.DEPTH_BITS, 24],
    [enums.STENCIL_CLEAR_VALUE, 37],
  ]);
  const frontKeys = [
    enums.STENCIL_FUNC,
    enums.STENCIL_REF,
    enums.STENCIL_VALUE_MASK,
    enums.STENCIL_FAIL,
    enums.STENCIL_PASS_DEPTH_FAIL,
    enums.STENCIL_PASS_DEPTH_PASS,
    enums.STENCIL_WRITEMASK,
  ];
  const backKeys = [
    enums.STENCIL_BACK_FUNC,
    enums.STENCIL_BACK_REF,
    enums.STENCIL_BACK_VALUE_MASK,
    enums.STENCIL_BACK_FAIL,
    enums.STENCIL_BACK_PASS_DEPTH_FAIL,
    enums.STENCIL_BACK_PASS_DEPTH_PASS,
    enums.STENCIL_BACK_WRITEMASK,
  ];
  frontKeys.forEach((key, index) =>
    params.set(key, [513, 29, 0xff, 7680, 7680, 7681, 0x3f][index]!)
  );
  backKeys.forEach((key, index) =>
    params.set(key, [516, 71, 0xf0, 7681, 7680, 7680, 0x55][index]!)
  );
  const getParameter = (key: number) =>
    key === enums.READ_FRAMEBUFFER_BINDING
      ? read
      : key === enums.DRAW_FRAMEBUFFER_BINDING
      ? draw
      : key === enums.RENDERBUFFER_BINDING
      ? buffer
      : params.get(key);
  const setFace = (face: number, offset: number, values: number[]) => {
    const keys = face === enums.FRONT ? frontKeys : backKeys;
    values.forEach((value, index) => params.set(keys[offset + index]!, value));
  };
  const gl = {
    ...enums,
    drawingBufferWidth: 2,
    drawingBufferHeight: 2,
    getParameter,
    isEnabled: (key: number) => enabled.has(key),
    enable: vi.fn((key: number) => enabled.add(key)),
    disable: vi.fn((key: number) => enabled.delete(key)),
    isContextLost: vi.fn(() => false),
    isFramebuffer: vi.fn((object: object) => valid.has(object)),
    createFramebuffer: vi.fn(() => {
      const object = { id: "backup-" + ++nextId };
      valid.add(object);
      bytes.set(object, new Uint8Array(4));
      return object;
    }),
    createRenderbuffer: vi.fn(() => ({ id: "buffer-" + ++nextId })),
    deleteFramebuffer: vi.fn((object: object) => {
      valid.delete(object);
      bytes.delete(object);
    }),
    deleteRenderbuffer: vi.fn(),
    bindFramebuffer: vi.fn((target: number, object: typeof read) => {
      if (target === enums.READ_FRAMEBUFFER) read = object;
      else draw = object;
    }),
    bindRenderbuffer: vi.fn((_target: number, object: typeof buffer) => {
      buffer = object;
    }),
    renderbufferStorage: vi.fn(),
    framebufferRenderbuffer: vi.fn(),
    drawBuffers: vi.fn(),
    readBuffer: vi.fn(),
    checkFramebufferStatus: vi.fn(() => enums.FRAMEBUFFER_COMPLETE),
    blitFramebuffer: vi.fn(() => {
      expect(enabled.has(enums.SCISSOR_TEST)).toBe(false);
      bytes.get(draw)!.set(bytes.get(read)!);
    }),
    stencilMask: vi.fn((mask: number) => {
      params.set(enums.STENCIL_WRITEMASK, mask);
      params.set(enums.STENCIL_BACK_WRITEMASK, mask);
    }),
    clearStencil: vi.fn((value: number) =>
      params.set(enums.STENCIL_CLEAR_VALUE, value)
    ),
    clear: vi.fn((mask: number) => {
      expect(mask).toBe(enums.STENCIL_BUFFER_BIT);
      const writable = params.get(enums.STENCIL_WRITEMASK)!;
      const value = params.get(enums.STENCIL_CLEAR_VALUE)!;
      bytes.get(draw)!.forEach((old, index, array) => {
        array[index] = (old & ~writable) | (value & writable);
      });
    }),
    stencilFuncSeparate: vi.fn((face: number, ...values: number[]) =>
      setFace(face, 0, values)
    ),
    stencilOpSeparate: vi.fn((face: number, ...values: number[]) =>
      setFace(face, 3, values)
    ),
    stencilMaskSeparate: vi.fn((face: number, value: number) =>
      setFace(face, 6, [value])
    ),
  };
  let cachedStencil = false;
  const setTest = vi.fn((value: boolean) => {
    if (value !== cachedStencil) {
      cachedStencil = value;
      if (value) gl.enable(enums.STENCIL_TEST);
      else gl.disable(enums.STENCIL_TEST);
    }
  });
  const renderer = {
    getContext: () => gl,
    getRenderTarget: () => null,
    state: { buffers: { stencil: { reset: vi.fn(), setTest } } },
  } as unknown as WebGLRenderer;
  const snapshot = () => ({
    read,
    draw,
    buffer,
    scissor: enabled.has(enums.SCISSOR_TEST),
    stencil: enabled.has(enums.STENCIL_TEST),
    clear: params.get(enums.STENCIL_CLEAR_VALUE),
    front: frontKeys.map((key) => params.get(key)),
    back: backKeys.map((key) => params.get(key)),
    bytes: [...bytes.get(originalDraw)!],
  });
  return {
    gl,
    renderer,
    params,
    bytes,
    valid,
    originalDraw,
    originalRead,
    originalBytes,
    snapshot,
  };
};

const createScene = () => {
  const root = new Group(),
    scene = { root } as MapLibreAnnotationScene;
  const disc = new Mesh(
    new RingGeometry(0.5, 1, 32),
    new MeshBasicMaterial({
      color: "blue",
      opacity: 0.2,
      transparent: true,
      side: DoubleSide,
      depthWrite: false,
    })
  );
  root.add(disc);
  root.updateMatrixWorld(true);
  const halo = createLineHaloMaterial(),
    scope = getMapLibreSceneHaloMask(scene);
  scope.trackDisc(disc);
  scope.trackHalo(halo);
  return {
    root,
    scene,
    disc,
    halo,
    scope,
    dispose: () => {
      disc.geometry.dispose();
      disc.material.dispose();
      halo.dispose();
      disposeMapLibreSceneHaloMask(scene);
    },
  };
};

describe("same-scene halo stencil scope", () => {
  it("shields only real depth-passing annulus fragments, keeps hole/model/outside darkenable and restores all native stencil bits", () => {
    const host = createHost(),
      sample = createScene(),
      before = host.snapshot();
    const beforeDisc = stencilProperties(sample.disc.material),
      beforeHalo = stencilProperties(sample.halo);
    const positions = [
      [0.75, 0],
      [0, 0],
      [1.5, 0],
      [0, 0.75],
    ];
    const covered = positions.map(
      ([x, y]) =>
        new Raycaster(
          new Vector3(x, y, 1),
          new Vector3(0, 0, -1)
        ).intersectObject(sample.disc).length > 0
    );
    expect(covered).toEqual([true, false, false, true]);
    try {
      sample.scope.render(host.renderer, () => {
        expect(sample.disc.material).toMatchObject({
          stencilWrite: true,
          stencilWriteMask: 0x80,
          stencilRef: 0x80,
          stencilFuncMask: 0x80,
          stencilFail: 7680,
          stencilZFail: 7680,
          stencilZPass: 7681,
        });
        expect(sample.halo).toMatchObject({
          stencilWrite: true,
          stencilWriteMask: 0,
          stencilRef: 0,
          stencilFuncMask: 0x80,
        });
        const content = host.bytes.get(host.originalDraw)!;
        expect([...content]).toEqual(
          [...host.originalBytes].map((value) => value & 0x7f)
        );
        covered.forEach((value, index) => {
          if (value && index !== 3)
            content[index] =
              (content[index]! & ~sample.disc.material.stencilWriteMask) |
              sample.disc.material.stencilRef;
        });
        expect(
          [...content].map(
            (value) =>
              (value & sample.halo.stencilFuncMask) === sample.halo.stencilRef
          )
        ).toEqual([false, true, true, true]);
      });
      expect(host.snapshot()).toEqual(before);
      expect(stencilProperties(sample.disc.material)).toEqual(beforeDisc);
      expect(stencilProperties(sample.halo)).toEqual(beforeHalo);
      expect(host.gl.blitFramebuffer).toHaveBeenCalledTimes(2);
      expect([...host.bytes.get(host.originalRead)!]).toEqual([1, 2, 3, 4]);
    } finally {
      sample.dispose();
    }
  });

  it("synchronizes Three's test cache so consecutive frames both use stencil and leave host state unchanged", () => {
    const host = createHost(),
      sample = createScene(),
      observed: boolean[] = [];
    try {
      for (let frame = 0; frame < 2; frame++)
        sample.scope.render(host.renderer, () => {
          host.renderer.state.buffers.stencil.setTest(sample.halo.stencilWrite);
          observed.push(host.gl.isEnabled(host.gl.STENCIL_TEST));
        });
      expect(observed).toEqual([true, true]);
      expect(host.gl.isEnabled(host.gl.STENCIL_TEST)).toBe(false);
      expect(host.gl.createFramebuffer).toHaveBeenCalledOnce();
      expect(host.gl.renderbufferStorage).toHaveBeenCalledOnce();
    } finally {
      sample.dispose();
    }
  });

  it("restores framebuffer contents, both stencil faces, bindings and material properties when the scene draw throws", () => {
    const host = createHost(),
      sample = createScene(),
      before = host.snapshot(),
      beforeHalo = stencilProperties(sample.halo);
    try {
      expect(() =>
        sample.scope.render(host.renderer, () => {
          host.bytes.get(host.originalDraw)!.fill(0x80);
          host.renderer.state.buffers.stencil.setTest(true);
          host.gl.disable(host.gl.SCISSOR_TEST);
          throw new Error("overlay draw failed");
        })
      ).toThrow("overlay draw failed");
      expect(host.snapshot()).toEqual(before);
      expect(stencilProperties(sample.halo)).toEqual(beforeHalo);
    } finally {
      sample.dispose();
    }
  });

  it.each([
    "MSAA",
    "small stencil",
    "lost context",
    "hidden ancestor",
    "zero opacity",
    "invisible material",
  ])("draws unchanged without touching native stencil for %s", (reason) => {
    const host = createHost(),
      sample = createScene(),
      beforeHalo = stencilProperties(sample.halo),
      draw = vi.fn();
    if (reason === "MSAA") host.params.set(host.gl.SAMPLES, 4);
    if (reason === "small stencil") host.params.set(host.gl.STENCIL_BITS, 4);
    if (reason === "lost context") host.gl.isContextLost.mockReturnValue(true);
    if (reason === "hidden ancestor") sample.root.visible = false;
    if (reason === "zero opacity") sample.disc.material.opacity = 0;
    if (reason === "invisible material") sample.disc.material.visible = false;
    const before = host.snapshot();
    try {
      sample.scope.render(host.renderer, draw);
      expect(draw).toHaveBeenCalledOnce();
      expect(host.snapshot()).toEqual(before);
      expect(host.gl.createFramebuffer).not.toHaveBeenCalled();
      expect(host.gl.clear).not.toHaveBeenCalled();
      expect(stencilProperties(sample.halo)).toEqual(beforeHalo);
    } finally {
      sample.dispose();
    }
  });

  it("uses a non-destructive fallback when the stencil backup framebuffer is incomplete", () => {
    const host = createHost(),
      sample = createScene(),
      draw = vi.fn(),
      before = host.snapshot();
    host.gl.checkFramebufferStatus.mockReturnValue(0);
    try {
      sample.scope.render(host.renderer, draw);
      expect(draw).toHaveBeenCalledOnce();
      expect(host.snapshot()).toEqual(before);
      expect(host.gl.clear).not.toHaveBeenCalled();
      expect(host.gl.blitFramebuffer).not.toHaveBeenCalled();
      expect(sample.halo.stencilWrite).toBe(false);
    } finally {
      sample.dispose();
    }
  });

  it("reuses storage, resizes it, and forgets invalid restored-context objects without deleting them", () => {
    const host = createHost(),
      sample = createScene();
    try {
      sample.scope.render(host.renderer, () => {});
      sample.scope.render(host.renderer, () => {});
      expect(host.gl.renderbufferStorage).toHaveBeenCalledOnce();
      host.gl.drawingBufferWidth = 3;
      sample.scope.render(host.renderer, () => {});
      expect(host.gl.renderbufferStorage).toHaveBeenCalledTimes(2);
      const oldFramebuffer = host.gl.createFramebuffer.mock.results[0]!.value;
      host.valid.delete(oldFramebuffer);
      sample.scope.render(host.renderer, () => {});
      expect(host.gl.createFramebuffer).toHaveBeenCalledTimes(2);
      expect(host.gl.deleteFramebuffer).not.toHaveBeenCalled();
      expect(host.gl.deleteRenderbuffer).not.toHaveBeenCalled();
    } finally {
      sample.dispose();
    }
    expect(host.gl.deleteFramebuffer).toHaveBeenCalledOnce();
    expect(host.gl.deleteRenderbuffer).toHaveBeenCalledOnce();
  });

  it("unregisters disposed disc/halo materials and frees owned buffers on scene disposal", () => {
    const host = createHost(),
      sample = createScene();
    sample.scope.render(host.renderer, () => {});
    sample.disc.material.dispose();
    sample.halo.dispose();
    host.gl.clear.mockClear();
    sample.scope.render(host.renderer, () => {});
    expect(host.gl.clear).not.toHaveBeenCalled();
    disposeMapLibreSceneHaloMask(sample.scene);
    expect(host.gl.deleteFramebuffer).toHaveBeenCalledOnce();
    expect(host.gl.deleteRenderbuffer).toHaveBeenCalledOnce();
    expect(getMapLibreSceneHaloMask(sample.scene)).not.toBe(sample.scope);
    sample.dispose();
  });
});
