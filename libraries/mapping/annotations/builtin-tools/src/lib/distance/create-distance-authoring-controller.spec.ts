import { afterEach, describe, expect, it, vi } from "vitest";
import { Vector3 } from "three";
import { ecefFromGeographicCoordinate } from "@carma-geo/proj";
import {
  ANNOTATION_TYPES,
  type AnnotationEngine,
  type AnnotationSceneLineOptions,
} from "@carma-mapping/annotations/core";
import type {
  AnnotationToolAuthoringContext,
  PointQueryPickResult,
} from "@carma-mapping/annotations/runtime";
import { createDistanceAuthoringController } from "./create-distance-authoring-controller";
const anchor = Object.freeze({
    longitude: 7.18,
    latitude: 51.26,
    altitude: 200,
  }),
  hover = Object.freeze({
    longitude: 7.1801,
    latitude: 51.2601,
    altitude: 220,
  });
const harness = (
  inScene = true,
  meterMarkers: "off" | "selected" | "always" = "always"
) => {
  const container = document.createElement("div");
  container.dataset.annotationLabelOverlayRoot = "true";
  document.body.append(container);
  const origin = ecefFromGeographicCoordinate(anchor),
    records = new Map<
      string,
      {
        style: AnnotationSceneLineOptions;
        positions: Vector3[];
        visible: boolean;
      }
    >();
  const release = vi.fn(),
    unsubscribe = vi.fn(),
    destroy = vi.fn(),
    mutate = vi.fn(() => {
      throw new Error("Preview must not change domain data");
    });
  const coordinates = Object.freeze([anchor]);
  const engine = {
    kind: inScene ? "maplibre" : "cesium",
    capabilities: {
      occludedLinesInScene: inScene,
      pointQueryDiscInScene: inScene,
    },
    isDestroyed: () => false,
    getOverlayContainer: () => container,
    worldToScreen: (p: Vector3) => ({
      x: 200 + (p.y - origin.y) * 10,
      y: 300 + (p.z - origin.z) * 10,
    }),
    requestRender: vi.fn(),
    subscribePostRender: () => release,
    createLineCollection: () => ({
      addLine: (style: AnnotationSceneLineOptions) => {
        const record = { style, positions: [] as Vector3[], visible: false };
        records.set(style.id, record);
        return {
          setPositions: (points: readonly Vector3[]) => {
            record.positions = points.map((p) => p.clone());
          },
          setVisible: (value: boolean) => {
            record.visible = value;
          },
          setStyle: (value: Partial<AnnotationSceneLineOptions>) => {
            record.style = { ...record.style, ...value };
          },
          destroy: () => undefined,
        };
      },
      destroy,
    }),
  } as unknown as AnnotationEngine;
  const context = {
    engine,
    drafts: {
      get: () => ({ coordinates }),
      subscribe: () => unsubscribe,
      set: mutate,
      clear: mutate,
    },
    annotationsStore: { dispatch: mutate },
    formatOptions: { lengthMeters: {} },
  } as unknown as AnnotationToolAuthoringContext;
  const controller = createDistanceAuthoringController({
    toolType: ANNOTATION_TYPES.DISTANCE,
    context,
    annotationLineStyleOptions: { meterMarkers },
  })!;
  const pointECEF = ecefFromGeographicCoordinate(hover);
  const pick: PointQueryPickResult = {
    coordinate: hover,
    pointECEF,
    surfaceNormalECEF: pointECEF.clone().normalize(),
    screenPosition: null,
  };
  const activate = () => {
    controller.setEnabled(true);
    controller.setPointQueryPickResult(pick);
  };
  const markers = () =>
    Array.from(
      container.querySelectorAll<HTMLDivElement>(
        "#annotation-overlay-distance-preview-layer > div"
      )
    ).filter(
      (node) =>
        node.style.borderRadius === "999px" && node.style.display !== "none"
    );
  return {
    container,
    records,
    controller,
    pick,
    activate,
    markers,
    coordinates,
    mutate,
    release,
    unsubscribe,
    destroy,
  };
};
afterEach(() => document.body.replaceChildren());
describe("actual distance draft scene controller", () => {
  it.each(["selected", "always"] as const)(
    "keeps only the direct metric ruler in %s mode and leaves projected legs with the common halo",
    (mode) => {
      const h = harness(true, mode);
      h.activate();
      expect(h.records.get("distance-preview-direct")!.style.ruler).toBe(true);
      for (const id of [
        "distance-preview-vertical",
        "distance-preview-horizontal",
      ]) {
        const line = h.records.get(id)!;
        expect(line.style.ruler).toBe(false);
        expect(line.style.halo).toBe(true);
        expect(line.visible).toBe(true);
        expect(line.positions).toHaveLength(2);
      }
      h.controller.destroy();
    }
  );
  it("leaves every ruler off in off mode without changing real geometry or pick input", () => {
    const h = harness(true, "off");
    h.activate();
    expect(
      [...h.records.values()].every((line) => line.style.ruler === false)
    ).toBe(true);
    const direct = h.records.get("distance-preview-direct")!;
    expect(
      direct.positions[0]!.distanceTo(ecefFromGeographicCoordinate(anchor))
    ).toBeLessThan(1e-8);
    expect(direct.positions[1]!.distanceTo(h.pick.pointECEF!)).toBeLessThan(
      1e-8
    );
    expect(h.pick.coordinate).toBe(hover);
    expect(h.coordinates).toEqual([anchor]);
    expect(h.mutate).not.toHaveBeenCalled();
    h.controller.destroy();
  });
  it("retains draft node markers in Three while leaving the active hover circle solely to the common sampler", () => {
    const h = harness();
    h.activate();
    expect(h.markers()).toHaveLength(1);
    expect(h.container.querySelectorAll("svg line")).toHaveLength(0);
    expect(h.mutate).not.toHaveBeenCalled();
    h.controller.setEnabled(false);
    expect(h.markers()).toHaveLength(0);
    h.controller.destroy();
  });
  it("retains the native Cesium draft and hover markers and original three SVG guides", () => {
    const h = harness(false);
    h.activate();
    expect(h.markers()).toHaveLength(2);
    expect(h.container.querySelectorAll("svg line")).toHaveLength(3);
    expect(
      h.records
        .get("distance-preview-direct")!
        .positions[1]!.distanceTo(h.pick.pointECEF!)
    ).toBeLessThan(1e-8);
    h.controller.destroy();
    expect(h.unsubscribe).toHaveBeenCalledTimes(1);
    expect(h.release).toHaveBeenCalledTimes(1);
    expect(h.destroy).toHaveBeenCalledTimes(1);
    expect(h.container.children).toHaveLength(0);
  });
});
