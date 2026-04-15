import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  type AnnotationToolType,
  ANNOTATION_TYPES,
} from "@carma-mapping/annotations/core";
import { Cartesian3 } from "@carma-cesium";
import { usePointQueryToolRouting } from "./use-point-query-tool-routing";
const { POLYLINE: ANNOTATION_TYPE_POLYLINE } = ANNOTATION_TYPES;

describe("usePointQueryToolRouting", () => {
  it("routes multipoint tools to node-chain creation even if the session map is stale", () => {
    const handlePointAnnotationCreated = vi.fn();
    const handleLabelAnnotationCreated = vi.fn();
    const handleNodeChainPointCreated = vi.fn();
    const setLabelInputPromptPointId = vi.fn();

    const { result } = renderHook(() =>
      usePointQueryToolRouting({
        activeToolType: ANNOTATION_TYPE_POLYLINE satisfies AnnotationToolType,
        toolSessions: {},
        handlePointAnnotationCreated,
        handleLabelAnnotationCreated,
        handleNodeChainPointCreated,
        setLabelInputPromptPointId,
      })
    );

    result.current.handlePointQueryPointCreated(
      "point-1",
      new Cartesian3(1, 2, 3)
    );

    expect(handleNodeChainPointCreated).toHaveBeenCalledWith(
      "point-1",
      expect.any(Cartesian3)
    );
    expect(handlePointAnnotationCreated).not.toHaveBeenCalled();
    expect(handleLabelAnnotationCreated).not.toHaveBeenCalled();
  });
});
