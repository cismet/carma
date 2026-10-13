import { Matrix4, Vector3 } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { REFERENCE_OBJECT_SCALING_MODES } from "@carma-commons/math";
import { ENU_UP_AXIS_COLOR } from "@carma-mapping/gizmo/core";
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

afterEach(() => {
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
    expect(
      h
        .label()
        ?.querySelector('[data-annotation-text-overlay-text="foreground"]')
        ?.textContent
    ).toBe("r 5 m");
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
    [64, "r 1 m"],
    [12.8, "r 5 m"],
    [3.2, "r 20 m"],
    [320, "r 20 cm"],
    [1280, "r 5 cm"],
    [32000, "r 2 mm"],
  ])("uses integer radius units at a ground scale of %s", (scale, text) => {
    const h = createHarness(true, Number(scale));
    const controller = h.createController();
    expect(
      h
        .label()
        ?.querySelector('[data-annotation-text-overlay-text="foreground"]')
        ?.textContent
    ).toBe(text);
    expect(
      h
        .label()
        ?.querySelector('[data-annotation-text-overlay-text="foreground"]')
        ?.textContent
    ).toMatch(/^r \d+ (m|cm|mm)$/);
    controller.destroy();
  });

  it.each([0.002, 0.02, 0.2, 1, 5, 20])(
    "draws an open cross and a metre-correct positive blue normal at radius %s",
    (radius) => {
      const h = createHarness(true, 64 / radius);
      const controller = h.createController({ innerHoleRadiusRatio: 0.4 });
      const cross = h.lines.get(
        "measurement-preview-point-ring-rim-crosshair"
      )!;
      expect(cross.options.segmentPairs).toBe(true);
      expect(cross.positions).toHaveLength(8);
      expect(
        Math.min(...cross.positions.map((p) => p.distanceTo(origin)))
      ).toBeCloseTo(radius * 0.2, 8);
      expect(
        Math.max(...cross.positions.map((p) => p.distanceTo(origin)))
      ).toBeCloseTo(radius * 0.376, 8);
      const shaft = h.lines.get(
        "measurement-preview-point-ring-normal"
      )!.positions;
      expect(shaft[0]!.clone().sub(origin).dot(normal)).toBeCloseTo(
        radius * 0.2,
        8
      );
      expect(shaft[1]!.clone().sub(origin).dot(normal)).toBeCloseTo(
        radius * 0.8,
        8
      );
      const arrow = h.primitives.find((p) => p.id.endsWith("-normal-arrow"))!;
      const tip = new Vector3(0, 0, 1).applyMatrix4(arrow.matrix);
      expect(tip.clone().sub(origin).dot(normal)).toBeCloseTo(radius, 8);
      expect(h.createCone.mock.calls[0]![0]).toMatchObject({
        color: ENU_UP_AXIS_COLOR,
      });
      controller.destroy();
    }
  );

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
