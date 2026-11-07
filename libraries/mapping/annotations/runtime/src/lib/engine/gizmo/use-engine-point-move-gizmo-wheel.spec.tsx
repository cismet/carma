import { renderHook } from "@testing-library/react";
import { Vector3 } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { forwardWheelToCanvas } from "@carma-mapping/gizmo/core";
import type {
  AnnotationEngine,
  AnnotationPointMoveGizmoOptions,
} from "@carma-mapping/annotations/core";
import { useEnginePointMoveGizmo } from "./use-engine-point-move-gizmo";
// Rendering and drag geometry are covered by their own suites; this owner hook
// and its actual DOM capture/forwarding lifecycle remain real.
const boundaries = vi.hoisted(() => ({
  overlay: { removeLabelOverlayElement: vi.fn() },
  drag: {
    startDragging: vi.fn(),
    startRotating: vi.fn(),
    startPlaneDragging: vi.fn(),
    stopDragging: vi.fn(),
  },
}));
vi.mock("@carma-providers/label-overlay", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useLabelOverlay: () => boundaries.overlay,
}));
vi.mock("./use-engine-point-move-gizmo-scene", () => ({
  usePointMoveGizmoScene: () => {},
}));
vi.mock("./use-engine-point-move-gizmo-overlay", () => ({
  usePointMoveGizmoOverlay: () => {},
}));
vi.mock("./use-engine-point-move-gizmo-drag", () => ({
  usePointMoveGizmoDrag: () => boundaries.drag,
}));
const payload = {
  deltaX: 12,
  deltaY: -45,
  deltaZ: 6,
  deltaMode: 1,
  clientX: 321,
  clientY: 234,
  ctrlKey: true,
  altKey: true,
  shiftKey: true,
  metaKey: true,
};
const harness = (inScene = true, active = true) => {
  const outer = document.createElement("div"),
    mapContainer = document.createElement("div"),
    canvas = document.createElement("canvas"),
    portal = document.createElement("div"),
    hit = document.createElement("button");
  portal.dataset.labelOverlayId = "gizmo";
  portal.append(hit);
  mapContainer.append(canvas);
  outer.append(mapContainer, portal);
  document.body.append(outer);
  const state = { destroyed: false };
  const engine = {
    kind: inScene ? "maplibre" : "cesium",
    capabilities: { occludedLinesInScene: inScene },
    createCone: vi.fn(),
    canvas,
    isDestroyed: () => state.destroyed,
    getOverlayContainer: () => mapContainer,
    requestRender: vi.fn(),
  } as unknown as AnnotationEngine;
  const labels = {
    verticalAxis: "up",
    eastAxis: "east",
    northAxis: "north",
    genericAxis: "axis",
    outerDisc: "outer",
    surfacePlane: "surface",
    freePlane: "free",
  };
  const options = {
    points: [{ id: "point", geometryECEF: new Vector3(6378137, 0, 0) }],
    movePointId: active ? "point" : null,
    labels,
    radius: 3,
  } satisfies AnnotationPointMoveGizmoOptions;
  const mapEvents: WheelEvent[] = [];
  mapContainer.addEventListener("wheel", (event) => mapEvents.push(event));
  const add = vi.spyOn(outer, "addEventListener"),
    remove = vi.spyOn(outer, "removeEventListener");
  const hook = renderHook(
    ({ id }) =>
      useEnginePointMoveGizmo(engine, { ...options, movePointId: id }),
    { initialProps: { id: options.movePointId } }
  );
  const event = () =>
    new WheelEvent("wheel", { ...payload, bubbles: true, cancelable: true });
  const captures = () => add.mock.calls.filter((call) => call[0] === "wheel");
  return {
    outer,
    mapContainer,
    canvas,
    portal,
    hit,
    state,
    engine,
    hook,
    mapEvents,
    event,
    add,
    remove,
    captures,
  };
};
afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
describe("Three edit overlay normal map wheel", () => {
  it.each(["label-overlay-id", "runtime-point-marker-shell"])(
    "forwards %s to the map exactly once, with the original pointer payload",
    (attribute) => {
      const h = harness();
      h.portal.removeAttribute("data-label-overlay-id");
      h.portal.setAttribute("data-" + attribute, "true");
      const originalHandler = vi.fn((event: WheelEvent) =>
        forwardWheelToCanvas(h.canvas, event)
      );
      h.hit.addEventListener("wheel", originalHandler);
      const original = h.event();
      h.hit.dispatchEvent(original);
      expect(original.defaultPrevented).toBe(true);
      expect(originalHandler).not.toHaveBeenCalled();
      expect(h.mapEvents).toHaveLength(1);
      const forwarded = h.mapEvents[0]!;
      expect(forwarded.target).toBe(h.canvas);
      expect(forwarded).not.toBe(original);
      for (const [key, value] of Object.entries(payload))
        expect(forwarded[key as keyof typeof payload]).toBe(value);
      expect(h.captures()).toHaveLength(1);
      expect(h.captures()[0]![2]).toEqual({ capture: true, passive: false });
      h.hook.unmount();
      expect(
        h.remove.mock.calls.filter((call) => call[0] === "wheel")
      ).toHaveLength(1);
    }
  );
  it("leaves normal canvas wheels and unrelated controls untouched", () => {
    const h = harness();
    const canvasWheel = h.event();
    h.canvas.dispatchEvent(canvasWheel);
    expect(h.mapEvents).toEqual([canvasWheel]);
    expect(canvasWheel.defaultPrevented).toBe(false);
    const input = document.createElement("input");
    h.outer.append(input);
    const seen = vi.fn();
    input.addEventListener("wheel", seen);
    const controlWheel = h.event();
    input.dispatchEvent(controlWheel);
    expect(seen).toHaveBeenCalledOnce();
    expect(controlWheel.defaultPrevented).toBe(false);
    expect(h.mapEvents).toHaveLength(1);
    h.hook.unmount();
  });
  it.each([
    [false, true],
    [true, false],
  ])(
    "does not register forwarding for inScene=%s, activeEdit=%s",
    (inScene, active) => {
      const h = harness(inScene, active);
      expect(h.captures()).toHaveLength(0);
      const seen = vi.fn();
      h.hit.addEventListener("wheel", seen);
      const event = h.event();
      h.hit.dispatchEvent(event);
      expect(seen).toHaveBeenCalledOnce();
      expect(event.defaultPrevented).toBe(false);
      expect(h.mapEvents).toHaveLength(0);
      h.hook.unmount();
    }
  );
  it("removes forwarding when edit ends and after unmount", () => {
    const h = harness();
    h.hook.rerender({ id: null });
    const event = h.event();
    h.hit.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(h.mapEvents).toHaveLength(0);
    h.hook.rerender({ id: "point" });
    h.hit.dispatchEvent(h.event());
    expect(h.mapEvents).toHaveLength(1);
    h.hook.unmount();
    const final = h.event();
    h.hit.dispatchEvent(final);
    expect(final.defaultPrevented).toBe(false);
    expect(h.mapEvents).toHaveLength(1);
  });
  it("ignores overlay wheels after the engine is destroyed", () => {
    const h = harness();
    h.state.destroyed = true;
    const event = h.event();
    h.hit.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(h.mapEvents).toHaveLength(0);
    h.hook.unmount();
  });
});
