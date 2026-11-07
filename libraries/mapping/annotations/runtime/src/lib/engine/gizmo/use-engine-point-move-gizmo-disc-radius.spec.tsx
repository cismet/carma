import { act, renderHook } from "@testing-library/react";
import { Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";
import { createSteppedScreenScaler } from "@carma-commons/math";
import {
  ANNOTATION_GIZMO_DISC_SCALING_MODES,
  type AnnotationEngine,
} from "@carma-mapping/annotations/core";
import type { PointMoveGizmoState } from "./engine-point-move-gizmo-state";
import { usePointMoveGizmoDiscRadius } from "./use-engine-point-move-gizmo-disc-radius";
const origin = new Vector3(6378137, 0, 0),
  normal = new Vector3(1, 0, 0);
const harness = (inScene: boolean, hasCone = true) => {
  let camera: { onMoveStart?: () => void; onMoveEnd?: () => void } = {};
  const state = { groundScale: 12.8 };
  const ground = origin.clone().add(new Vector3(10, 0, 0));
  const getGround = vi.fn(() => ground);
  const release = vi.fn();
  const engine = {
    kind: inScene ? "maplibre" : "cesium",
    capabilities: { occludedLinesInScene: inScene },
    createCone: hasCone ? vi.fn() : undefined,
    isDestroyed: () => false,
    canvas: { clientWidth: 800, clientHeight: 600 },
    worldToScreen: (p: Vector3) => ({ x: p.y * 16, y: p.z * 16 }),
    getScreenPixelsPerMeterAt: (p: Vector3) =>
      p.equals(ground) ? state.groundScale : 16,
    getViewportCenterGroundPosition: getGround,
    subscribeCameraMove: vi.fn((callbacks: typeof camera) => {
      camera = callbacks;
      return release;
    }),
    requestRender: vi.fn(),
  } as unknown as AnnotationEngine;
  const gizmo = {
    radius: 3,
    stepFactor: 4,
    discSteppedScaler: createSteppedScreenScaler(),
    freezeDiscScaleDuringDrag: true,
    isDragging: false,
    frozenDragDiscRadius: null,
    movePoint: { id: "point", positionECEF: origin },
  } as unknown as PointMoveGizmoState;
  return {
    engine,
    gizmo,
    state,
    getGround,
    release,
    end: () => camera.onMoveEnd?.(),
  };
};
const options = {
  discScalingMode: ANNOTATION_GIZMO_DISC_SCALING_MODES.WORLD,
  discOutlineScreenPixelRadius: 48,
  discResizeWorldRadiusToScreenTarget: false,
  discQuantizeWorldRadius: true,
  discSizing: {},
};
describe("Three edit sizing capability and drag contract", () => {
  it("uses the shared centre-ground policy for an in-scene gizmo", () => {
    const h = harness(true),
      hook = renderHook(() =>
        usePointMoveGizmoDiscRadius(h.engine, h.gizmo, options)
      );
    expect(hook.result.current.computeDiscWorldRadius(origin, normal)).toBe(5);
    h.state.groundScale = 32;
    act(() => h.end());
    expect(hook.result.current.computeDiscWorldRadius(origin, normal)).toBe(2);
    expect(h.engine.requestRender).toHaveBeenCalledOnce();
    hook.unmount();
    expect(h.release).toHaveBeenCalledOnce();
  });
  it("freezes the held radius throughout a drag even when moveend changes the shared policy", () => {
    const h = harness(true),
      hook = renderHook(() =>
        usePointMoveGizmoDiscRadius(h.engine, h.gizmo, options)
      );
    h.gizmo.isDragging = true;
    expect(
      hook.result.current.resolveDiscWorldRadiusForFrame(origin, normal)
    ).toBe(5);
    h.state.groundScale = 32;
    act(() => h.end());
    expect(
      hook.result.current.resolveDiscWorldRadiusForFrame(origin, normal)
    ).toBe(5);
    h.gizmo.isDragging = false;
    h.gizmo.frozenDragDiscRadius = null;
    expect(
      hook.result.current.resolveDiscWorldRadiusForFrame(origin, normal)
    ).toBe(2);
    hook.unmount();
  });
  it.each([
    [false, true],
    [true, false],
  ])(
    "keeps legacy sizing when occludedLines=%s and cone=%s",
    (inScene, hasCone) => {
      const h = harness(inScene, hasCone),
        hook = renderHook(() =>
          usePointMoveGizmoDiscRadius(h.engine, h.gizmo, options)
        );
      expect(hook.result.current.computeDiscWorldRadius(origin, normal)).toBe(
        3
      );
      expect(h.getGround).not.toHaveBeenCalled();
      expect(h.engine.subscribeCameraMove).not.toHaveBeenCalled();
      hook.unmount();
    }
  );
  it("keeps the legacy screen mode target rather than applying the Three defaults", () => {
    const h = harness(false),
      hook = renderHook(() =>
        usePointMoveGizmoDiscRadius(h.engine, h.gizmo, {
          ...options,
          discScalingMode: ANNOTATION_GIZMO_DISC_SCALING_MODES.SCREEN,
        })
      );
    expect(
      hook.result.current.computeDiscWorldRadius(origin, normal)
    ).toBeCloseTo(3);
    expect(h.getGround).not.toHaveBeenCalled();
    hook.unmount();
  });
});
