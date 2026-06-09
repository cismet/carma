import { Cartesian3, EllipsoidTangentPlane } from "@carma-cesium";
import { describe, expect, it, vi } from "vitest";
import type {
  AnnotationToolDraftState,
  AnnotationToolDraftStore,
  CesiumGeographicCoordinate,
} from "@carma-mapping/annotations/runtime";
import { geographicCoordinateFromCartesian3 } from "@carma-mapping/engines/cesium/core";

import { createAreaGroundToolPlugin } from "./area-ground-tool-plugin";

const createDraftStore = (): AnnotationToolDraftStore => {
  const drafts = new Map<string, AnnotationToolDraftState>();
  return {
    get: (toolId) =>
      drafts.get(toolId) ?? {
        coordinates: [],
        linkedNodeGroupIds: [],
        feedback: null,
      },
    set: (toolId, draft) => {
      drafts.set(toolId, draft);
    },
    clear: (toolId) => {
      drafts.delete(toolId);
    },
    subscribe: () => () => undefined,
  };
};

const createOffsetCoordinateFactory = () => {
  const anchor = Cartesian3.fromDegrees(7, 51, 100);
  const tangentPlane = new EllipsoidTangentPlane(anchor);

  return (
    eastOffsetMeters: number,
    northOffsetMeters: number
  ): CesiumGeographicCoordinate => {
    const eastOffset = Cartesian3.multiplyByScalar(
      tangentPlane.xAxis,
      eastOffsetMeters,
      new Cartesian3()
    );
    const northOffset = Cartesian3.multiplyByScalar(
      tangentPlane.yAxis,
      northOffsetMeters,
      new Cartesian3()
    );

    return geographicCoordinateFromCartesian3(
      Cartesian3.add(
        anchor,
        Cartesian3.add(eastOffset, northOffset, new Cartesian3()),
        new Cartesian3()
      )
    );
  };
};

describe("createAreaGroundToolPlugin", () => {
  it("rejects node registration when the new actual edge crosses an older edge", () => {
    const plugin = createAreaGroundToolPlugin();
    const coordinateAtOffset = createOffsetCoordinateFactory();
    const drafts = createDraftStore();
    const session = plugin.session?.createSession({
      addAnnotation: vi.fn(),
      dispatch: vi.fn(),
      drafts,
      getState: vi.fn(),
      setActiveToolType: vi.fn(),
    } as never);

    [
      coordinateAtOffset(0, 0),
      coordinateAtOffset(0, 10),
      coordinateAtOffset(10, 0),
      coordinateAtOffset(-5, 5),
    ].forEach((coordinate) => session?.onNodeCreated?.(coordinate));

    const draft = drafts.get(plugin.id);
    expect(draft.coordinates).toHaveLength(3);
    expect(draft.feedback?.kind).toBe("warning");
    expect(draft.feedback?.message).toContain("neue Kante");
  });

  it("allows node registration when only the preliminary close edge would cross", () => {
    const plugin = createAreaGroundToolPlugin();
    const coordinateAtOffset = createOffsetCoordinateFactory();
    const drafts = createDraftStore();
    const session = plugin.session?.createSession({
      addAnnotation: vi.fn(),
      dispatch: vi.fn(),
      drafts,
      getState: vi.fn(),
      setActiveToolType: vi.fn(),
    } as never);

    [
      coordinateAtOffset(0, 0),
      coordinateAtOffset(10, 0),
      coordinateAtOffset(0, 10),
      coordinateAtOffset(10, 10),
    ].forEach((coordinate) => session?.onNodeCreated?.(coordinate));

    const draft = drafts.get(plugin.id);
    expect(draft.coordinates).toHaveLength(4);
    expect(draft.feedback).toBeNull();
  });
});
