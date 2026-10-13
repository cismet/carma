import { renderHook } from "@testing-library/react";
import { Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";
import type { CssPixelPosition } from "@carma-units";

import type {
  AnnotationEngine,
  AnnotationSceneLineOptions,
  AnnotationSceneLineStyle,
} from "@carma-mapping/annotations/core";
import type { RuntimePointLabelRenderModel } from "./annotation-render-models";
import {
  LABEL_STEM_SCENE_DEFAULTS,
  resolveLabelStemPositionsECEF,
  resolveLabelStemSceneStyle,
  type LabelStemLayout,
} from "./label-stem-scene-lines";
import { useLabelStemSceneLines } from "./use-label-stem-scene-lines";

/** A pinhole camera at the origin looking down -z, focal length 100 px, no screen offset. */
const FOCAL = 100;
const createEngine = () => {
  const preRenderListeners = new Set<() => void>();
  const lines: {
    options: AnnotationSceneLineOptions;
    setStyle: ReturnType<typeof vi.fn>;
    setPositions: ReturnType<typeof vi.fn>;
  }[] = [];
  const engine = {
    isDestroyed: () => false,
    requestRender: () => undefined,
    worldToScreen: (position: Vector3) =>
      position.z < 0
        ? {
            x: (FOCAL * position.x) / -position.z,
            y: (FOCAL * -position.y) / -position.z,
          }
        : null,
    getPickRay: ({ x, y }: { x: number; y: number }) => ({
      origin: new Vector3(),
      direction: new Vector3(x / FOCAL, -y / FOCAL, -1).normalize(),
    }),
    subscribePreRender: (listener: () => void) => {
      preRenderListeners.add(listener);
      return () => preRenderListeners.delete(listener);
    },
    createLineCollection: () => ({
      addLine: (options: AnnotationSceneLineOptions) => {
        const line = {
          options,
          setStyle: vi.fn(),
          setPositions: vi.fn(),
        };
        lines.push(line);
        return {
          id: options.id,
          setStyle: line.setStyle,
          setPositions: line.setPositions,
          setVisible: vi.fn(),
          destroy: vi.fn(),
        };
      },
      destroy: vi.fn(),
    }),
  } as unknown as AnnotationEngine;
  const renderFrame = () =>
    preRenderListeners.forEach((listener) => listener());
  return { engine, lines, renderFrame };
};

const anchor = new Vector3(0, 0, -50);
const segment = {
  start: { x: 5, y: 0 } as CssPixelPosition,
  end: { x: 30, y: -40 } as CssPixelPosition,
};

describe("resolveLabelStemPositionsECEF", () => {
  it("puts both ends at the anchor's depth, on the overlay's segment", () => {
    const { engine } = createEngine();
    const [start, end] = resolveLabelStemPositionsECEF(
      engine,
      anchor,
      segment
    )!;
    expect(start.z).toBeCloseTo(-50, 9);
    expect(end.z).toBeCloseTo(-50, 9);
    expect(engine.worldToScreen(start)).toEqual({
      x: expect.closeTo(5, 9),
      y: expect.closeTo(0, 9),
    });
    expect(engine.worldToScreen(end)).toEqual({
      x: expect.closeTo(30, 9),
      y: expect.closeTo(-40, 9),
    });
  });

  it("has no stem for an anchor behind the camera", () => {
    const { engine } = createEngine();
    expect(
      resolveLabelStemPositionsECEF(engine, new Vector3(0, 0, 10), segment)
    ).toBeNull();
  });
});

describe("resolveLabelStemSceneStyle", () => {
  it("draws a visible node's stem solid over the scene", () => {
    expect(
      resolveLabelStemSceneStyle("white", { isOccluded: false, opacity: 1 })
    ).toEqual({
      color: "white",
      width: LABEL_STEM_SCENE_DEFAULTS.widthPx,
      overlay: true,
      halo: false,
      opacity: 1,
    });
  });

  it("dashes a hidden node's whole stem at the label's opacity", () => {
    const style = resolveLabelStemSceneStyle("white", {
      isOccluded: true,
      opacity: 0.75,
    });
    expect(style.overlay).toBe(true);
    expect(style.occludedDashed).toBeUndefined();
    expect(style.dash).toEqual(LABEL_STEM_SCENE_DEFAULTS.occludedDash);
    expect(style.opacity).toBe(0.75);
  });
});

describe("useLabelStemSceneLines", () => {
  const label = { id: "p1", lineColor: "red" } as RuntimePointLabelRenderModel;

  it("follows the anchor's occlusion verdict frame by frame", () => {
    const { engine, lines, renderFrame } = createEngine();
    let layout: LabelStemLayout | null = {
      anchorECEF: anchor,
      segment,
      isOccluded: false,
      opacity: 1,
    };
    const labels = [label];
    renderHook(() => useLabelStemSceneLines(engine, labels, () => layout));
    expect(lines).toHaveLength(1);
    const [line] = lines;
    expect(line!.options).toMatchObject({
      id: "p1-stem",
      color: "red",
      overlay: true,
    });
    expect(line!.options.dash).toBeUndefined();

    renderFrame();
    expect(line!.setStyle).not.toHaveBeenCalled();
    expect(line!.setPositions).toHaveBeenLastCalledWith([
      expect.any(Vector3),
      expect.any(Vector3),
    ]);

    layout = { ...layout, isOccluded: true, opacity: 0.75 };
    renderFrame();
    const hiddenStyle = line!.setStyle.mock
      .calls[0]![0] as AnnotationSceneLineStyle;
    expect(hiddenStyle.dash).toEqual(LABEL_STEM_SCENE_DEFAULTS.occludedDash);
    expect(hiddenStyle.opacity).toBe(0.75);

    layout = null;
    renderFrame();
    expect(line!.setPositions).toHaveBeenLastCalledWith([]);
  });
});
