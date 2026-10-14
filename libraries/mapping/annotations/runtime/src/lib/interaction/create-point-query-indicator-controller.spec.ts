import { Matrix4, Vector3 } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Milliseconds } from "@carma-units";
import { REFERENCE_OBJECT_SCALING_MODES } from "@carma-commons/math";
import type {
  AnnotationEngine,
  AnnotationSceneLineHandle,
  AnnotationSceneLineOptions,
  AnnotationScenePrimitiveHandle,
} from "@carma-mapping/annotations/core";

import { createPointQueryIndicatorController } from "./create-point-query-indicator-controller";
import { POINT_QUERY_DISC_PLACEMENT_MODES } from "./point-query-disc-placement-mode";

const origin = new Vector3(6378137, 0, 0);
const normal = new Vector3(1, 0, 0);
const controllers = new Set<
  ReturnType<typeof createPointQueryIndicatorController>
>();

const createHarness = (inScene = true, scale = 12.8) => {
  const canvas = document.createElement("canvas");
  Object.defineProperties(canvas, {
    clientWidth: { value: 800, configurable: true },
    clientHeight: { value: 600, configurable: true },
  });
  const container = document.createElement("div");
  container.dataset.annotationLabelOverlayRoot = "true";
  container.append(canvas);
  document.body.append(container);
  const ground = origin.clone().add(new Vector3(200, 0, 0));
  const state = {
    groundScale: scale,
    pointerScale: scale,
    projectionAvailable: true,
  };
  let preRender: (() => void) | null = null;
  let cameraMove: { onMoveStart?: () => void; onMoveEnd?: () => void } = {};
  const releasePointer = vi.fn();
  const releaseFrame = vi.fn(() => {
    preRender = null;
  });
  const releaseCamera = vi.fn();
  const lines = new Map<
    string,
    {
      options: AnnotationSceneLineOptions;
      positions: Vector3[];
      visible: boolean;
      destroyed: boolean;
    }
  >();
  const primitives: {
    id: string;
    matrix: Matrix4;
    visible: boolean;
    destroyed: boolean;
  }[] = [];
  const createPrimitive = (options: { id: string; modelMatrix?: Matrix4 }) => {
    const record = {
      id: options.id,
      matrix: options.modelMatrix?.clone() ?? new Matrix4(),
      visible: true,
      destroyed: false,
    };
    primitives.push(record);
    return {
      setModelMatrix: (value: Matrix4) => {
        record.matrix.copy(value);
      },
      setVisible: (value: boolean) => {
        record.visible = value;
      },
      destroy: () => {
        record.destroyed = true;
      },
    } as AnnotationScenePrimitiveHandle;
  };
  const createRing = vi.fn(createPrimitive);
  const createCone = vi.fn(createPrimitive);
  const getViewportCenterGroundPosition = vi.fn(() => ground.clone());
  const worldToScreen = vi.fn((point: Vector3) =>
    state.projectionAvailable
      ? {
          x: 200 + point.y * 16 + point.z * 7,
          y: 120 + point.y * 3 - point.z * 12,
        }
      : null
  );
  const engine = {
    kind: inScene ? "maplibre" : "cesium",
    capabilities: { pointQueryDiscInScene: inScene },
    canvas,
    getOverlayContainer: () => container,
    isDestroyed: () => false,
    requestRender: vi.fn(),
    getViewportCenterGroundPosition,
    getScreenPixelsPerMeterAt: (point: Vector3) =>
      point.equals(ground) ? state.groundScale : state.pointerScale,
    worldToScreen,
    pointer: {
      register: vi.fn(() => releasePointer),
      getScreenPosition: () => null,
    },
    subscribePreRender: vi.fn((callback: () => void) => {
      preRender = callback;
      return releaseFrame;
    }),
    subscribeCameraMove: vi.fn((callbacks: typeof cameraMove) => {
      cameraMove = callbacks;
      return releaseCamera;
    }),
    createRing,
    createCone,
    createLineCollection: () => {
      const records: typeof lines extends Map<string, infer T> ? T[] : never =
        [];
      return {
        addLine: (options: AnnotationSceneLineOptions) => {
          const record = {
            options,
            positions: [] as Vector3[],
            visible: false,
            destroyed: false,
          };
          records.push(record);
          lines.set(options.id, record);
          return {
            setPositions: (positions: readonly Vector3[]) => {
              record.positions = positions.map((p) => p.clone());
            },
            setVisible: (visible: boolean) => {
              record.visible = visible;
            },
            setStyle: (style: Partial<AnnotationSceneLineOptions>) => {
              record.options = { ...record.options, ...style };
            },
            destroy: () => {
              record.destroyed = true;
            },
          } as AnnotationSceneLineHandle;
        },
        destroy: () => {
          records.forEach((record) => {
            record.destroyed = true;
          });
        },
      };
    },
  } as unknown as AnnotationEngine;
  const createController = (
    options: Partial<
      Parameters<typeof createPointQueryIndicatorController>[1]
    > = {}
  ) => {
    const controller = createPointQueryIndicatorController(engine, {
      radius: 3,
      placementMode: POINT_QUERY_DISC_PLACEMENT_MODES.CAMERA_PLANE_REPROJECT,
      showNormalLine: true,
      tangentDiscVisualizerTrailSampleCount: 1,
      ...options,
    });
    const destroy = controller.destroy;
    controller.destroy = () => {
      controllers.delete(controller);
      destroy();
    };
    controllers.add(controller);
    controller.setEnabled(true);
    controller.setPreview({ pointECEF: origin, surfaceNormalECEF: normal });
    return controller;
  };
  const label = () =>
    container.querySelector<HTMLDivElement>(
      '[data-test-id="measurement-point-query-radius"]'
    );
  const ring = () =>
    primitives.filter((p) => p.id === "measurement-preview-point-ring").at(-1)!;
  const radius = () =>
    new Vector3().setFromMatrixColumn(ring().matrix, 0).length();
  return {
    engine,
    state,
    lines,
    primitives,
    createCone,
    createRing,
    getViewportCenterGroundPosition,
    worldToScreen,
    container,
    createController,
    label,
    labelText: () =>
      label()?.querySelector('[data-annotation-text-overlay-text="foreground"]')
        ?.textContent,
    selectedRadius: () => Number(label()?.dataset.radiusMeters),
    displayedRadius: () => Number(label()?.dataset.displayedRadiusMeters),
    advance: (milliseconds: number) => {
      vi.advanceTimersByTime(milliseconds);
      preRender?.();
    },
    ring,
    radius,
    frame: () => preRender?.(),
    startMove: () => cameraMove.onMoveStart?.(),
    endMove: () => cameraMove.onMoveEnd?.(),
    releasePointer,
    releaseFrame,
    releaseCamera,
  };
};

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ["performance", "setTimeout", "clearTimeout", "Date"],
  });
});
afterEach(() => {
  for (const controller of controllers) controller.destroy();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("scene point-query sampler controller", () => {
  it("sizes from viewport ground once, independent of the shared edit-gizmo fields and pointer", () => {
    const h = createHarness();
    const controller = h.createController({
      radius: 999,
      scalingMode: REFERENCE_OBJECT_SCALING_MODES.SCREEN,
      targetScreenRadiusCssPx: 2,
      resizeWorldRadiusToScreenTarget: false,
      discResizeStepFactor: 2,
      quantizeStepWorldRadius: false,
    });
    expect(h.radius()).toBeCloseTo(5);
    h.state.pointerScale = 25;
    controller.setPreview({
      pointECEF: origin.clone().add(new Vector3(0, 100, 0)),
      surfaceNormalECEF: normal,
    });
    for (let i = 0; i < 12; i += 1) h.frame();
    expect(h.radius()).toBeCloseTo(5);
    expect(h.getViewportCenterGroundPosition).toHaveBeenCalledTimes(1);
    expect(h.labelText()).toBe("R5 m");
    controller.destroy();
  });

  it("holds during camera movement and repicks from fresh centre ground after actual moveend", () => {
    const h = createHarness();
    const controller = h.createController();
    h.startMove();
    h.state.groundScale = 32;
    for (let i = 0; i < 8; i += 1) h.frame();
    expect(h.radius()).toBeCloseTo(5);
    expect(h.getViewportCenterGroundPosition).toHaveBeenCalledTimes(1);
    h.endMove();
    h.frame();
    expect(h.selectedRadius()).toBe(2);
    h.advance(200);
    expect(h.radius()).toBeCloseTo(2);
    for (let i = 0; i < 8; i += 1) h.frame();
    expect(h.getViewportCenterGroundPosition).toHaveBeenCalledTimes(2);
    controller.destroy();
  });

  it("puts the line label right of the actual projected tilted rim", () => {
    const h = createHarness();
    const controller = h.createController();
    controller.setPreview({
      pointECEF: origin,
      surfaceNormalECEF: new Vector3(0.6, 0.7, 0.8).normalize(),
    });
    const rim = h.lines.get("measurement-preview-point-ring-rim")!;
    const projected = rim.positions.map((p) => h.worldToScreen(p)!);
    const rightmost = projected.reduce((a, b) => (b.x > a.x ? b : a));
    const placement = h
      .label()!
      .style.transform.match(/translate\(([-.\d]+)px,\s*([-.\d]+)px\)/)!;
    expect(Number(placement[1])).toBeGreaterThan(rightmost.x);
    expect(Number(placement[2])).toBeCloseTo(rightmost.y);
    expect(
      h.label()?.classList.contains("carma-annotation-overlay-line-label")
    ).toBe(true);
    expect(
      h.label()?.querySelector(".carma-annotation-overlay-line-label__frame")
    ).not.toBeNull();
    controller.destroy();
  });

  it.each([
    [64, "R1 m"],
    [12.8, "R5 m"],
    [3.2, "R20 m"],
    [320, "R20 cm"],
    [1280, "R5 cm"],
    [32000, "R2 mm"],
  ])("uses integer radius units at a ground scale of %s", (scale, text) => {
    const h = createHarness(true, Number(scale));
    const controller = h.createController();
    expect(h.labelText()).toBe(text);
    expect(h.labelText()).toMatch(/^R\d+ (m|cm|mm)$/);
    controller.destroy();
  });

  it.each([0.002, 0.02, 0.2, 1, 5, 20])(
    "draws six open arms with metre-correct normal Z at radius %s and no cone",
    (radius) => {
      const h = createHarness(true, 64 / radius);
      const controller = h.createController({ innerHoleRadiusRatio: 0.4 });
      const cross = h.lines.get(
        "measurement-preview-point-ring-rim-crosshair"
      )!;
      expect(cross.options).toMatchObject({
        segmentPairs: true,
        occludedDashed: true,
      });
      expect(cross.positions).toHaveLength(12);
      expect(
        Math.min(...cross.positions.map((p) => p.distanceTo(origin)))
      ).toBeCloseTo(radius * 0.2, 8);
      expect(
        Math.max(...cross.positions.map((p) => p.distanceTo(origin)))
      ).toBeCloseTo(radius * 0.376, 8);
      expect(
        cross.positions
          .slice(0, 8)
          .every((p) => Math.abs(p.clone().sub(origin).dot(normal)) < 1e-8)
      ).toBe(true);
      cross.positions
        .slice(8)
        .forEach((p, index) =>
          expect(p.clone().sub(origin).dot(normal)).toBeCloseTo(
            [-0.2, -0.376, 0.2, 0.376][index]! * radius,
            8
          )
        );
      expect(cross.options.color).toBe(
        h.lines.get("measurement-preview-point-ring-rim")!.options.color
      );
      expect(h.lines.has("measurement-preview-point-ring-normal")).toBe(false);
      expect(h.createCone).not.toHaveBeenCalled();
      controller.destroy();
    }
  );

  it("keeps the four tangent arms when normal display is disabled", () => {
    const h = createHarness();
    h.createController({ showNormalLine: false, innerHoleRadiusRatio: 0.4 });
    expect(
      h.lines.get("measurement-preview-point-ring-rim-crosshair")!.positions
    ).toHaveLength(8);
    expect(h.createCone).not.toHaveBeenCalled();
  });

  it("fades after three seconds of the same size despite pointer, frame and same-size view updates", () => {
    const h = createHarness();
    const controller = h.createController();
    expect(h.label()?.style.transition).toBe("opacity 250ms ease-out");
    for (let index = 0; index < 5; index += 1) {
      h.advance(500);
      controller.setPreview({
        pointECEF: origin.clone().add(new Vector3(0, index, 0)),
        surfaceNormalECEF: normal,
      });
    }
    h.startMove();
    h.endMove();
    h.frame();
    expect(h.selectedRadius()).toBe(5);
    expect(vi.getTimerCount()).toBe(1);
    h.advance(499);
    expect(h.label()?.style.opacity).toBe("1");
    h.advance(1);
    expect(h.label()?.style.opacity).toBe("0");
    expect(vi.getTimerCount()).toBe(0);
    h.advance(500);
    expect(h.label()?.style.opacity).toBe("0");
  });

  it("shows a new selected radius immediately and finishes the visual transition without prolonging its hold", () => {
    const h = createHarness();
    h.createController();
    h.advance(3000);
    expect(h.label()?.style.opacity).toBe("0");
    h.state.groundScale = 32;
    h.endMove();
    h.frame();
    expect(h.labelText()).toBe("R2 m");
    expect(h.selectedRadius()).toBe(2);
    expect(h.radius()).toBeCloseTo(5);
    expect(h.label()?.style.opacity).toBe("1");
    h.advance(100);
    expect(h.radius()).toBeCloseTo(Math.sqrt(10));
    expect(h.displayedRadius()).toBeCloseTo(h.radius());
    expect(h.selectedRadius()).toBe(2);
    expect(h.labelText()).toBe("R2 m");
    h.advance(100);
    expect(h.radius()).toBeCloseTo(2);
    expect(h.displayedRadius()).toBe(2);
    vi.mocked(h.engine.requestRender).mockClear();
    h.advance(2799);
    expect(h.engine.requestRender).not.toHaveBeenCalled();
    expect(h.label()?.style.opacity).toBe("1");
    h.advance(1);
    expect(h.label()?.style.opacity).toBe("0");
  });

  it("retargets an in-flight transition from its displayed size without a jump", () => {
    const h = createHarness();
    h.createController();
    h.state.groundScale = 32;
    h.endMove();
    h.frame();
    h.advance(100);
    const displayed = h.radius();
    h.state.groundScale = 3.2;
    h.endMove();
    h.frame();
    expect(h.selectedRadius()).toBe(20);
    expect(h.radius()).toBeCloseTo(displayed);
    expect(h.labelText()).toBe("R20 m");
    h.advance(100);
    expect(h.radius()).toBeCloseTo(Math.sqrt(displayed * 20));
    h.advance(100);
    expect(h.radius()).toBeCloseTo(20);
    expect(vi.getTimerCount()).toBe(1);
  });

  it("honors explicit millisecond timings", () => {
    const h = createHarness();
    h.createController({
      pointQueryDiscSizing: {
        radiusLabelVisibleDurationMs: 50 as Milliseconds,
        radiusLabelFadeDurationMs: 40 as Milliseconds,
        resizeAnimationDurationMs: 100 as Milliseconds,
      },
    });
    expect(h.label()?.style.transition).toBe("opacity 40ms ease-out");
    h.advance(50);
    expect(h.label()?.style.opacity).toBe("0");
    h.state.groundScale = 32;
    h.endMove();
    h.frame();
    h.advance(50);
    expect(h.radius()).toBeCloseTo(Math.sqrt(10));
    h.advance(50);
    expect(h.radius()).toBeCloseTo(2);
    expect(h.label()?.style.opacity).toBe("0");
  });

  it.each(["clear", "disable", "destroy"] as const)(
    "cancels label timers and pending motion on %s",
    (action) => {
      const h = createHarness();
      const controller = h.createController();
      h.state.groundScale = 32;
      h.endMove();
      h.frame();
      h.advance(100);
      expect(vi.getTimerCount()).toBe(1);
      if (action === "clear") controller.clearPreview();
      else if (action === "disable") controller.setEnabled(false);
      else controller.destroy();
      expect(vi.getTimerCount()).toBe(0);
      expect(h.label() === null || h.label()?.style.display === "none").toBe(
        true
      );
      expect(h.primitives.every((p) => p.destroyed || !p.visible)).toBe(true);
      vi.mocked(h.engine.requestRender).mockClear();
      h.advance(10000);
      expect(vi.getTimerCount()).toBe(0);
      expect(h.engine.requestRender).not.toHaveBeenCalled();
    }
  );

  it("uses reduced-motion preference for instant size changes and opacity without removing the hold", () => {
    const matchMedia = vi.fn(() => ({ matches: true } as MediaQueryList));
    vi.stubGlobal("matchMedia", matchMedia);
    const h = createHarness();
    h.createController();
    expect(matchMedia).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)");
    expect(h.label()?.style.transition).toBe("opacity 0ms ease-out");
    h.state.groundScale = 32;
    h.endMove();
    h.frame();
    expect(h.radius()).toBeCloseTo(2);
    expect(h.displayedRadius()).toBe(2);
    h.advance(2999);
    expect(h.label()?.style.opacity).toBe("1");
    h.advance(1);
    expect(h.label()?.style.opacity).toBe("0");
  });

  it("hides on unavailable projection, clear and disable, and releases all resources on destroy", () => {
    const h = createHarness();
    const controller = h.createController();
    h.state.projectionAvailable = false;
    h.frame();
    expect(h.label()?.style.display).toBe("none");
    h.state.projectionAvailable = true;
    h.frame();
    expect(h.label()?.style.display).toBe("block");
    controller.clearPreview();
    expect(h.label()?.style.display).toBe("none");
    expect([...h.lines.values()].every((line) => !line.visible)).toBe(true);
    controller.setPreview({ pointECEF: origin, surfaceNormalECEF: normal });
    controller.setEnabled(false);
    expect(h.label()?.style.display).toBe("none");
    expect(h.primitives.every((p) => p.destroyed || !p.visible)).toBe(true);
    controller.destroy();
    expect(h.label()).toBeNull();
    expect(h.releasePointer).toHaveBeenCalledOnce();
    expect(h.releaseFrame).toHaveBeenCalledOnce();
    expect(h.releaseCamera).toHaveBeenCalledOnce();
    expect([...h.lines.values()].every((line) => line.destroyed)).toBe(true);
    expect(h.primitives.every((p) => p.destroyed)).toBe(true);
  });
});

describe("legacy point-query controller", () => {
  it("keeps diameter-snapped sizing and its symmetric normal without scene labels, cross or cone", () => {
    const h = createHarness(false, 16);
    const controller = h.createController({
      scalingMode: REFERENCE_OBJECT_SCALING_MODES.WORLD,
      resizeWorldRadiusToScreenTarget: true,
      targetScreenRadiusCssPx: 48,
      quantizeStepWorldRadius: true,
    });
    expect(h.radius()).toBeCloseTo(2.5);
    expect(h.label()).toBeNull();
    expect(h.createCone).not.toHaveBeenCalled();
    expect([...h.lines.keys()]).toEqual([
      "measurement-preview-point-ring-normal",
    ]);
    const shaft = h.lines.get(
      "measurement-preview-point-ring-normal"
    )!.positions;
    expect(shaft[0]!.clone().sub(origin).dot(normal)).toBeCloseTo(-2.5);
    expect(shaft[1]!.clone().sub(origin).dot(normal)).toBeCloseTo(2.5);
    h.state.pointerScale = 12;
    h.frame();
    expect(h.radius()).toBeCloseTo(2.5);
    expect(h.getViewportCenterGroundPosition).not.toHaveBeenCalled();
    expect(h.engine.subscribeCameraMove).not.toHaveBeenCalled();
    controller.destroy();
  });
});
