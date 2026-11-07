import { describe, expect, it, vi } from "vitest";
import {
  Group,
  Vector3,
  PerspectiveCamera,
  type WebGLRenderer,
  type Scene,
} from "three";
import type { MapLibreAnnotationScene } from "./maplibre-annotation-scene.types";
import {
  createRuler,
  disposeRuler,
  placeRulerDots,
} from "./maplibre-scene-ruler";
import { resolveMapLibreMeasurementStyle } from "./maplibre-measurement-style";
vi.mock("./maplibre-canvas-2d", () => ({ createCanvas2d: () => null }));
const harness = () => {
  const root = new Group(),
    camera = new PerspectiveCamera();
  const scene = {
    root,
    sceneFromEcef: (p: Vector3, out = new Vector3()) => out.copy(p),
    getCameraScenePosition: (out: Vector3) => out.set(0, 0, 100),
    getCssViewport: () => ({ width: 1600, height: 600 }),
    worldToScreen: (p: Vector3, out = { x: 0, y: 0 }) => {
      out.x = p.x * 100;
      out.y = 300;
      return out;
    },
  } as unknown as MapLibreAnnotationScene;
  const style = resolveMapLibreMeasurementStyle({
    gridPitchSeriesMeters: [1],
    rulerMinSegmentCssPx: 32,
    rulerMarkerClearanceCssPx: 16,
  });
  const lineStyle = { color: "white", width: 2 };
  const ruler = createRuler(scene, "test", lineStyle, style);
  const place = (from: number, to: number, start = 0, pixelRatio = 1) =>
    placeRulerDots(
      scene,
      style,
      ruler,
      {
        positionsECEF: [new Vector3(from, 0, 0), new Vector3(to, 0, 0)],
        style: { ...lineStyle, rulerStartMeters: start },
      },
      100,
      pixelRatio
    );
  return { scene, root, camera, style, ruler, place };
};
const xs = (cuts: number[], ratio = 1) =>
  cuts.filter((_, i) => i % 3 === 0).map((x) => x / (100 * ratio));
describe("regular Three ruler beats and device size", () => {
  it("retains every metric beat at and around the segment midpoint with endpoint clearance", () => {
    const h = harness();
    expect(xs(h.place(0, 12))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(xs(h.place(0, 1.05))).toEqual([]);
    disposeRuler(h.scene, h.ruler);
    expect(h.root.children).toHaveLength(0);
  });
  it("keeps cumulative phase through a fractional segment boundary", () => {
    const h = harness();
    const first = xs(h.place(0, 4.5));
    const second = xs(h.place(4.5, 12.5, 4.5));
    expect(first).toEqual([1, 2, 3, 4]);
    expect(second).toEqual([5, 6, 7, 8, 9, 10, 11, 12]);
    expect([...first, ...second]).toEqual(
      Array.from({ length: 12 }, (_, i) => i + 1)
    );
    disposeRuler(h.scene, h.ruler);
  });
  it("keeps metric phase and CSS positions unchanged when canvas device ratio changes", () => {
    const h = harness();
    expect(xs(h.place(0, 12, 0, 2), 2)).toEqual(xs(h.place(0, 12, 0, 1), 1));
    disposeRuler(h.scene, h.ruler);
  });
  it.each([1, 2.5])(
    "preserves actual physical point diameters through renderer DPR %s",
    (pixelRatio) => {
      const h = harness();
      h.place(0, 12, 0, 2);
      const renderer = {
        getPixelRatio: () => pixelRatio,
      } as unknown as WebGLRenderer;
      for (const [points, expected] of [
        [h.ruler.minor, 14],
        [h.ruler.major, 20],
      ] as const) {
        expect(points.userData.rulerDiameterDevicePx).toBe(expected);
        points.onBeforeRender(
          renderer,
          h.root as unknown as Scene,
          h.camera,
          points.geometry,
          points.material,
          null
        );
        expect(points.material.size * renderer.getPixelRatio()).toBeCloseTo(
          expected,
          10
        );
        expect(points.material.sizeAttenuation).toBe(false);
      }
      disposeRuler(h.scene, h.ruler);
    }
  );
  it("refreshes stored physical diameter when the canvas ratio changes", () => {
    const h = harness();
    h.place(0, 12, 0, 2);
    expect(h.ruler.minor.userData.rulerDiameterDevicePx).toBe(14);
    h.place(0, 12, 0, 1);
    expect(h.ruler.minor.userData.rulerDiameterDevicePx).toBe(7);
    expect(h.ruler.major.userData.rulerDiameterDevicePx).toBe(10);
    disposeRuler(h.scene, h.ruler);
  });
});
