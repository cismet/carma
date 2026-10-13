import { describe, expect, it, vi } from "vitest";
import { Vector3 } from "three";

import type { AnnotationSceneLineHandle } from "@carma-mapping/annotations/core";
import { createLiveAnnotationAnchors } from "../../interaction/live-annotation-anchors";
import type { EdgeSceneLine } from "./edge-models";
import {
  applyLiveAnchorsToSceneLines,
  type SceneLineHandle,
} from "./edge-scene-lines";

const handleFor = (line: EdgeSceneLine) => {
  const setPositions = vi.fn();
  const handle: SceneLineHandle = {
    signature: line.id,
    line,
    sceneLine: { setPositions } as unknown as AnnotationSceneLineHandle,
    excludedFromDragSamples: false,
    baseStart: line.start,
    baseEnd: line.end,
    recompute: line.recompute,
    overridden: false,
    destroy: () => undefined,
  };
  return { handle, setPositions };
};

const line = (overrides: Partial<EdgeSceneLine>): EdgeSceneLine => ({
  id: "line",
  start: new Vector3(0, 0, 0),
  end: new Vector3(1, 0, 0),
  stroke: "white",
  strokeWidth: 1,
  occludedDashed: true,
  ruler: false,
  ...overrides,
});

describe("applyLiveAnchorsToSceneLines", () => {
  const noAnchors = createLiveAnnotationAnchors(() => undefined);
  const polyline = [
    new Vector3(0, 0, 0),
    new Vector3(1, 0, 0),
    new Vector3(1, 1, 0),
  ];

  it("recomputes lines that follow the view every frame, polylines included", () => {
    const { handle, setPositions } = handleFor(
      line({ followsView: true, recompute: () => polyline })
    );
    applyLiveAnchorsToSceneLines(new Map([["line", handle]]), noAnchors);
    expect(setPositions).toHaveBeenCalledWith(polyline);
  });

  it("leaves other recomputed lines alone without drag anchors", () => {
    const recompute = vi.fn(() => polyline);
    const { handle, setPositions } = handleFor(line({ recompute }));
    applyLiveAnchorsToSceneLines(new Map([["line", handle]]), noAnchors);
    expect(recompute).not.toHaveBeenCalled();
    expect(setPositions).not.toHaveBeenCalled();
  });

  it("restores the base once a view-following line has no positions", () => {
    let next: Vector3[] | null = polyline;
    const { handle, setPositions } = handleFor(
      line({ followsView: true, recompute: () => next })
    );
    const handles = new Map([["line", handle]]);
    applyLiveAnchorsToSceneLines(handles, noAnchors);
    next = null;
    applyLiveAnchorsToSceneLines(handles, noAnchors);
    expect(setPositions).toHaveBeenLastCalledWith([
      handle.baseStart,
      handle.baseEnd,
    ]);
  });
});
