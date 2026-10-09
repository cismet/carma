import { Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";
import type {
  AnnotationToolDraftState,
  AnnotationToolDraftStore,
} from "@carma-mapping/annotations/runtime";
import {
  ecefFromGeographicCoordinate,
  geographicCoordinateFromEcef,
  getEllipsoidalUpDirectionAtAnchor,
  type AnnotationGeographicCoordinate,
} from "@carma-mapping/annotations/core";

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
  const anchor = ecefFromGeographicCoordinate({
    longitude: 7,
    latitude: 51,
    altitude: 100,
  });
  const localUp = getEllipsoidalUpDirectionAtAnchor(anchor);
  const localEast = new Vector3()
    .crossVectors(new Vector3(0, 0, 1), localUp)
    .normalize();
  const localNorth = new Vector3().crossVectors(localUp, localEast).normalize();

  return (
    eastOffsetMeters: number,
    northOffsetMeters: number
  ): AnnotationGeographicCoordinate => {
    const eastOffset = localEast.clone().multiplyScalar(eastOffsetMeters);
    const northOffset = localNorth.clone().multiplyScalar(northOffsetMeters);

    return geographicCoordinateFromEcef(
      anchor.clone().add(eastOffset).add(northOffset)
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
