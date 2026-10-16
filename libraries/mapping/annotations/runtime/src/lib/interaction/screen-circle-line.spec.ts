import { PerspectiveCamera, Raycaster, Vector2, Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";
import type { CssPixels } from "@carma-units";
import type {
  AnnotationEngine,
  AnnotationSceneLineOptions,
} from "@carma-mapping/annotations/core";
import { annotationVisualStyles } from "../config/annotation-visual-defaults";
import { createScreenCircleLine } from "./screen-circle-line";
import { createDiscRimLine } from "./disc-rim-line";
import { createEnuOrientedDiscMatrix } from "@carma-mapping/annotations/core";
const harness = (offset = new Vector3()) => {
  const width = 800,
    height = 600,
    camera = new PerspectiveCamera(50, width / height, 0.1, 2000);
  camera.position.set(10, 5, 40).add(offset);
  camera.lookAt(offset);
  camera.updateMatrixWorld(true);
  const rays = new Raycaster();
  const lines = new Map<
    string,
    {
      options: AnnotationSceneLineOptions;
      positions: Vector3[];
      visible: boolean;
      destroyed: boolean;
    }
  >();
  const state = { projection: true, ray: true, destroyed: false };
  const worldToScreen = (p: Vector3) => {
    if (!state.projection) return null;
    const ndc = p.clone().project(camera);
    return { x: ((ndc.x + 1) * width) / 2, y: ((1 - ndc.y) * height) / 2 };
  };
  const destroy = vi.fn();
  const engine = {
    isDestroyed: () => state.destroyed,
    worldToScreen,
    getCameraPose: () => ({
      directionECEF: camera.getWorldDirection(new Vector3()),
    }),
    getPickRay: ({ x, y }: { x: number; y: number }) => {
      if (!state.ray) return null;
      rays.setFromCamera(
        new Vector2((2 * x) / width - 1, 1 - (2 * y) / height),
        camera
      );
      return rays.ray.clone();
    },
    createLineCollection: () => ({
      addLine: (options: AnnotationSceneLineOptions) => {
        const record = {
          options,
          positions: [] as Vector3[],
          visible: false,
          destroyed: false,
        };
        lines.set(options.id, record);
        return {
          setPositions: (points: readonly Vector3[]) => {
            record.positions = points.map((p) => p.clone());
          },
          setStyle: (style: Partial<AnnotationSceneLineOptions>) => {
            record.options = { ...record.options, ...style };
          },
          setVisible: (visible: boolean) => {
            record.visible = visible;
          },
          destroy: () => {
            record.destroyed = true;
          },
        };
      },
      destroy: () => {
        destroy();
        for (const line of lines.values()) line.destroyed = true;
      },
    }),
  } as unknown as AnnotationEngine;
  return { engine, lines, state, worldToScreen, destroy };
};
describe("shared screen-space centre circle", () => {
  it.each([new Vector3(0, 0, 0), new Vector3(8, 4, -100)])(
    "keeps the previous ten CSS pixel outer diameter in perspective at %s",
    (center) => {
      const h = harness(),
        circle = createScreenCircleLine(h.engine, "circle", {
          diameterCssPx: 10 as CssPixels,
          halo: true,
        });
      circle.apply(center, "white");
      const line = h.lines.get("circle")!,
        screen = h.worldToScreen(center)!;
      expect(line.visible).toBe(true);
      expect(line.options.width).toBe(
        annotationVisualStyles.point.outlineWidth
      );
      expect(line.positions).toHaveLength(25);
      for (const point of line.positions) {
        const p = h.worldToScreen(point)!;
        expect(Math.hypot(p.x - screen.x, p.y - screen.y)).toBeCloseTo(4.5, 8);
      }
      expect(
        line.positions[0]!.distanceTo(line.positions.at(-1)!)
      ).toBeLessThan(1e-12);
      expect(line.options).toMatchObject({
        overlay: true,
        overlayHalo: true,
        halo: true,
      });
      circle.destroy();
      expect(line.destroyed).toBe(true);
    }
  );
  it("updates colour, clears invalid projections and releases its collection", () => {
    const h = harness(),
      circle = createScreenCircleLine(h.engine, "circle", {
        diameterCssPx: 10 as CssPixels,
        halo: false,
      });
    circle.apply(new Vector3(), "white");
    circle.apply(new Vector3(3, 1, -10), "blue");
    const line = h.lines.get("circle")!;
    expect(line.options.color).toBe("blue");
    expect(line.options.overlayHalo).toBe(false);
    h.state.ray = false;
    circle.apply(new Vector3(), "blue");
    expect(line.visible).toBe(false);
    h.state.ray = true;
    circle.apply(new Vector3(), "blue");
    expect(line.visible).toBe(true);
    h.state.projection = false;
    circle.apply(new Vector3(), "blue");
    expect(line.visible).toBe(false);
    circle.destroy();
    expect(h.destroy).toHaveBeenCalledOnce();
  });
  it("does not allocate a line for a disabled circle or a destroyed engine", () => {
    const h = harness();
    const disabled = createScreenCircleLine(h.engine, "disabled", {
      diameterCssPx: 0 as CssPixels,
      halo: true,
    });
    disabled.apply(new Vector3(), "white");
    expect(h.lines.size).toBe(0);
    h.state.destroyed = true;
    createScreenCircleLine(h.engine, "dead", {
      diameterCssPx: 10 as CssPixels,
      halo: true,
    }).apply(new Vector3(), "white");
    expect(h.lines.size).toBe(0);
    disabled.destroy();
  });
  it("shares the tick primitive with edit guides without drawing another rim", () => {
    const origin = new Vector3(6378137, 0, 0),
      h = harness(origin);
    const guide = createDiscRimLine(h.engine, "edit", 24, {
      drawRim: false,
      innerRadiusRatio: 0.5,
      centerCircleDiameterCssPx: 10 as CssPixels,
      halo: true,
    });
    guide.apply(
      createEnuOrientedDiscMatrix(origin, new Vector3(1, 0, 0), 5),
      "white",
      { normalRadiusMeters: 5 }
    );
    expect(h.lines.has("edit")).toBe(false);
    expect(h.lines.get("edit-center-circle")!.options.color).toBe(
      annotationVisualStyles.point.outline
    );
    expect(h.lines.get("edit-center-circle")!.options.width).toBe(1);
    const ticks = h.lines.get("edit-crosshair")!;
    expect(ticks.positions).toHaveLength(12);
    expect(ticks.options.halo).toBe(true);
    expect(
      Math.min(...ticks.positions.map((p) => p.distanceTo(origin)))
    ).toBeCloseTo(1.25, 8);
    expect(
      Math.max(...ticks.positions.map((p) => p.distanceTo(origin)))
    ).toBeCloseTo(2.5, 8);
    guide.clear();
    expect(ticks.visible).toBe(false);
    guide.destroy();
    expect(ticks.destroyed).toBe(true);
  });
  it("disables only the centre circle at zero size and leaves all six edit ticks", () => {
    const origin = new Vector3(6378137, 0, 0),
      h = harness(origin);
    const guide = createDiscRimLine(h.engine, "edit-no-circle", 24, {
      drawRim: false,
      innerRadiusRatio: 0.5,
      centerCircleDiameterCssPx: 0 as CssPixels,
    });
    guide.apply(
      createEnuOrientedDiscMatrix(origin, new Vector3(1, 0, 0), 5),
      "white",
      { normalRadiusMeters: 5 }
    );
    expect(h.lines.has("edit-no-circle-center-circle")).toBe(false);
    expect(h.lines.has("edit-no-circle")).toBe(false);
    const ticks = h.lines.get("edit-no-circle-crosshair")!;
    expect(ticks.visible).toBe(true);
    expect(ticks.positions).toHaveLength(12);
    guide.clear();
    expect(ticks.visible).toBe(false);
    guide.destroy();
    expect(ticks.destroyed).toBe(true);
  });
});
