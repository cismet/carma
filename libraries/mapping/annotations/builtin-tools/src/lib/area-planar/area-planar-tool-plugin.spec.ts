import { describe, expect, it, vi } from "vitest";

import type {
  AnnotationToolDraftState,
  AnnotationToolDraftStore,
  CesiumGeographicCoordinate,
} from "@carma-mapping/annotations/runtime";
import { ANNOTATION_TYPES } from "@carma-mapping/annotations/core";

import { createAreaPlanarTrapezoidToolPlugin } from "./area-planar-tool-plugin";

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

const geographicCoordinate = (
  longitude: number,
  latitude: number,
  altitude = 100
): CesiumGeographicCoordinate => ({
  longitude,
  latitude,
  altitude,
});

describe("area planar tool plugin", () => {
  it("finishes trapezoid measurements after the fourth click", () => {
    const plugin = createAreaPlanarTrapezoidToolPlugin();
    const drafts = createDraftStore();
    const addAnnotation = vi.fn((annotationType, coordinates) => ({
      id: "annotation-1",
      toolType: annotationType,
      coordinates,
    }));
    const session = plugin.session?.createSession({
      addAnnotation,
      dispatch: vi.fn(),
      drafts,
      getState: vi.fn(),
      setActiveToolType: vi.fn(),
    } as never);

    session?.onNodeCreated?.(geographicCoordinate(7, 51));
    session?.onNodeCreated?.(geographicCoordinate(7.0001, 51, 100.05));
    session?.onNodeCreated?.(geographicCoordinate(7.00008, 51.00008, 103));
    session?.onNodeCreated?.(geographicCoordinate(7.00002, 51.00008, 104));

    expect(addAnnotation).toHaveBeenCalledTimes(1);
    expect(addAnnotation.mock.calls[0]?.[0]).toBe(ANNOTATION_TYPES.AREA_PLANAR);
    expect(addAnnotation.mock.calls[0]?.[1]).toHaveLength(4);
    expect(drafts.get(plugin.id).coordinates).toHaveLength(0);
  });

  it("rejects trapezoid second points outside the horizontal plane tolerance", () => {
    const plugin = createAreaPlanarTrapezoidToolPlugin({
      trapezoidHorizontalPlaneToleranceMeters: 0.1,
    });
    const drafts = createDraftStore();
    const addAnnotation = vi.fn();
    const session = plugin.session?.createSession({
      addAnnotation,
      dispatch: vi.fn(),
      drafts,
      getState: vi.fn(),
      setActiveToolType: vi.fn(),
    } as never);

    session?.onNodeCreated?.(geographicCoordinate(7, 51));
    session?.onNodeCreated?.(geographicCoordinate(7.0001, 51, 101));

    const draft = drafts.get(plugin.id);
    expect(addAnnotation).not.toHaveBeenCalled();
    expect(draft.coordinates).toHaveLength(1);
    expect(draft.feedback?.kind).toBe("warning");
  });

  it("allows force accepted trapezoid second points outside the horizontal plane tolerance", () => {
    const plugin = createAreaPlanarTrapezoidToolPlugin({
      trapezoidHorizontalPlaneToleranceMeters: 0.1,
    });
    const drafts = createDraftStore();
    const addAnnotation = vi.fn();
    const session = plugin.session?.createSession({
      addAnnotation,
      dispatch: vi.fn(),
      drafts,
      getState: vi.fn(),
      setActiveToolType: vi.fn(),
    } as never);

    session?.onNodeCreated?.(geographicCoordinate(7, 51));
    session?.onNodeCreated?.(
      geographicCoordinate(7.0001, 51, 101),
      null,
      { forceAccepted: true }
    );

    const draft = drafts.get(plugin.id);
    expect(addAnnotation).not.toHaveBeenCalled();
    expect(draft.coordinates).toHaveLength(2);
    expect(draft.feedback).toBeNull();
  });

  it("allows force accepted trapezoid second points beyond the local horizontal line max length", () => {
    const createSession = () => {
      const plugin = createAreaPlanarTrapezoidToolPlugin({
        trapezoidHorizontalLineMaxLengthMeters: 5,
      });
      const drafts = createDraftStore();
      const addAnnotation = vi.fn();
      const session = plugin.session?.createSession({
        addAnnotation,
        dispatch: vi.fn(),
        drafts,
        getState: vi.fn(),
        setActiveToolType: vi.fn(),
      } as never);

      return { plugin, drafts, addAnnotation, session };
    };

    const normalClick = createSession();
    normalClick.session?.onNodeCreated?.(geographicCoordinate(7, 51));
    normalClick.session?.onNodeCreated?.(geographicCoordinate(7.0001, 51));

    const normalDraft = normalClick.drafts.get(normalClick.plugin.id);
    expect(normalClick.addAnnotation).not.toHaveBeenCalled();
    expect(normalDraft.coordinates).toHaveLength(1);
    expect(normalDraft.feedback?.message).toContain("geodätische");

    const forcedClick = createSession();
    forcedClick.session?.onNodeCreated?.(geographicCoordinate(7, 51));
    forcedClick.session?.onNodeCreated?.(
      geographicCoordinate(7.0001, 51),
      null,
      { forceAccepted: true }
    );

    const forcedDraft = forcedClick.drafts.get(forcedClick.plugin.id);
    expect(forcedClick.addAnnotation).not.toHaveBeenCalled();
    expect(forcedDraft.coordinates).toHaveLength(2);
    expect(forcedDraft.feedback).toBeNull();
  });
});
