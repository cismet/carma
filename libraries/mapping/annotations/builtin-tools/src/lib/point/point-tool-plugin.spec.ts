import { Vector3 } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ecefFromGeographicCoordinate } from "@carma-geo/proj";
import type { AnnotationEngine } from "@carma-mapping/annotations/core";
import { type PointQueryPickResult } from "@carma-mapping/annotations/runtime";
import { createPointToolPlugin } from "./point-tool-plugin";
type AuthoringContext = Parameters<
  NonNullable<
    ReturnType<typeof createPointToolPlugin>["authoringVisuals"]
  >["createController"]
>[0];
const first = { longitude: 7.18, latitude: 51.26, altitude: 200 },
  second = { longitude: 7.1801, latitude: 51.2601, altitude: 220 };
const pick = (
  coordinate: PointQueryPickResult["coordinate"]
): PointQueryPickResult => ({
  coordinate,
  screenPosition: null,
  pointECEF: coordinate ? ecefFromGeographicCoordinate(coordinate) : null,
  surfaceNormalECEF: coordinate ? new Vector3(1, 0, 0) : null,
});
const harness = (inScene = true) => {
  const container = document.createElement("div");
  container.dataset.annotationLabelOverlayRoot = "true";
  document.body.append(container);
  const state = { destroyed: false, project: true, screenX: 20, screenY: 30 };
  let frame: (() => void) | null = null;
  const release = vi.fn(() => {
    frame = null;
  });
  const collectionDestroy = vi.fn(),
    setPositions = vi.fn(),
    setVisible = vi.fn();
  const engine = {
    kind: inScene ? "maplibre" : "cesium",
    capabilities: { pointQueryDiscInScene: inScene },
    isDestroyed: () => state.destroyed,
    getOverlayContainer: vi.fn(() => container),
    worldToScreen: vi.fn(() =>
      state.project ? { x: state.screenX, y: state.screenY } : null
    ),
    subscribePostRender: vi.fn((callback: () => void) => {
      frame = callback;
      return release;
    }),
    requestRender: vi.fn(),
    createLineCollection: vi.fn(() => ({
      addLine: vi.fn(() => ({
        setPositions,
        setVisible,
        setStyle: vi.fn(),
        destroy: vi.fn(),
      })),
      destroy: collectionDestroy,
    })),
  } as unknown as AnnotationEngine;
  const persisted = Object.freeze({
      nodes: Object.freeze([]),
      annotationEntries: Object.freeze([]),
    }),
    draft = Object.freeze({ coordinates: Object.freeze([]) });
  const dispatch = vi.fn(() => {
      throw Error("Preview must not dispatch persisted changes");
    }),
    setDraft = vi.fn(() => {
      throw Error("Hover must not change draft state");
    });
  const context = {
    engine,
    annotationsStore: { getState: () => persisted, dispatch },
    drafts: { getState: () => draft, setState: setDraft, dispatch: setDraft },
  } as unknown as AuthoringContext;
  const controller =
    createPointToolPlugin().authoringVisuals!.createController(context);
  const marker = () =>
    container.querySelector<HTMLDivElement>(
      "#annotation-overlay-point-preview-layer > div"
    );
  return {
    engine,
    state,
    context,
    controller,
    container,
    marker,
    frame: () => frame?.(),
    release,
    collectionDestroy,
    setPositions,
    setVisible,
    dispatch,
    setDraft,
    persisted,
    draft,
  };
};
afterEach(() => document.body.replaceChildren());
describe("Three Point tool hover marker using the real line preview renderer", () => {
  it("leaves the live hover circle to the shared sampler instead of allocating a duplicate DOM marker", () => {
    const h = harness(),
      controller = h.controller!;
    controller.setEnabled(true);
    controller.setPointQueryPickResult(pick(first));
    expect(h.marker()).toBeNull();
    h.state.screenX = 80;
    h.state.screenY = 90;
    controller.setPointQueryPickResult(pick(second));
    expect(h.marker()).toBeNull();
    expect(
      vi
        .mocked(h.engine.worldToScreen)
        .mock.calls.at(-1)![0]
        .distanceTo(ecefFromGeographicCoordinate(second))
    ).toBeLessThan(1e-8);
    h.frame();
    expect(h.marker()).toBeNull();
    expect(h.setPositions).not.toHaveBeenCalled();
    expect(
      h.container.querySelectorAll(
        "#annotation-overlay-point-preview-layer > div"
      )
    ).toHaveLength(0);
    controller.destroy();
  });
  it.each(["null result", "null coordinate", "disabled", "projection missing"])(
    "keeps the sampler-owned hover marker deduplicated for %s",
    (reason) => {
      const h = harness(),
        controller = h.controller!;
      controller.setEnabled(true);
      controller.setPointQueryPickResult(pick(first));
      expect(h.marker()).toBeNull();
      if (reason === "null result") controller.setPointQueryPickResult(null);
      else if (reason === "null coordinate")
        controller.setPointQueryPickResult(pick(null));
      else if (reason === "disabled") controller.setEnabled(false);
      else {
        h.state.project = false;
        h.frame();
      }
      expect(h.marker()).toBeNull();
      expect(h.setVisible).not.toHaveBeenCalledWith(true);
      controller.destroy();
    }
  );
  it("never persists hover samples or mutates the draft, and honours requestRender false", () => {
    const h = harness(),
      controller = h.controller!;
    controller.setPointQueryPickResult(pick(first));
    expect(h.marker()).toBeNull();
    controller.setEnabled(true);
    vi.mocked(h.engine.requestRender).mockClear();
    controller.setPointQueryPickResult(pick(second), { requestRender: false });
    expect(h.engine.requestRender).not.toHaveBeenCalled();
    expect(h.dispatch).not.toHaveBeenCalled();
    expect(h.setDraft).not.toHaveBeenCalled();
    expect(h.context.annotationsStore.getState()).toBe(h.persisted);
    expect(h.context.drafts.getState()).toBe(h.draft);
    controller.destroy();
  });
  it("allocates no authoring overlay, lines or subscriptions for Cesium", () => {
    const h = harness(false);
    expect(h.controller).toBeNull();
    expect(h.engine.getOverlayContainer).not.toHaveBeenCalled();
    expect(h.engine.createLineCollection).not.toHaveBeenCalled();
    expect(h.engine.subscribePostRender).not.toHaveBeenCalled();
    expect(h.container.childElementCount).toBe(0);
  });
  it("does not allocate against a destroyed engine", () => {
    const h = harness(false);
    h.state.destroyed = true;
    const engine = {
      ...h.engine,
      capabilities: { pointQueryDiscInScene: true },
    } as AnnotationEngine;
    expect(
      createPointToolPlugin().authoringVisuals!.createController({
        ...h.context,
        engine,
      })
    ).toBeNull();
    expect(h.engine.getOverlayContainer).not.toHaveBeenCalled();
  });
  it("removes the overlay and frame subscriber on destroy", () => {
    const h = harness(),
      controller = h.controller!;
    controller.setEnabled(true);
    controller.setPointQueryPickResult(pick(first));
    controller.destroy();
    expect(h.release).toHaveBeenCalledOnce();
    expect(h.collectionDestroy).toHaveBeenCalledOnce();
    expect(h.marker()).toBeNull();
    expect(h.container.childElementCount).toBe(0);
    h.frame();
    expect(h.container.childElementCount).toBe(0);
  });
});
