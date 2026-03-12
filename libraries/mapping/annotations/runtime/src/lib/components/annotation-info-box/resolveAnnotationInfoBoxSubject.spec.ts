import { describe, expect, it } from "vitest";

import {
  ANNOTATION_TYPE_AREA_GROUND,
  ANNOTATION_TYPE_DISTANCE,
  ANNOTATION_TYPE_LABEL,
  ANNOTATION_TYPE_POINT,
  ANNOTATION_TYPE_POLYLINE,
  SELECT_TOOL_TYPE,
  type DistancePointEntry,
  type NodeChainAnnotation,
  type PointMeasurementEntry,
} from "@carma-mapping/annotations/core";

import { resolveAnnotationInfoBoxSubject } from "./resolveAnnotationInfoBoxSubject";

const createPointMeasurement = (
  id: string,
  {
    auxiliaryLabelAnchor = false,
  }: {
    auxiliaryLabelAnchor?: boolean;
  } = {}
): PointMeasurementEntry =>
  ({
    id,
    type: ANNOTATION_TYPE_POINT,
    timestamp: 1,
    auxiliaryLabelAnchor,
    geometryECEF: {} as PointMeasurementEntry["geometryECEF"],
    geometryWGS84: {} as PointMeasurementEntry["geometryWGS84"],
  } as PointMeasurementEntry);

const createDistanceMeasurement = (id: string): DistancePointEntry =>
  ({
    id,
    type: ANNOTATION_TYPE_DISTANCE,
    timestamp: 1,
    geometryECEF: {} as DistancePointEntry["geometryECEF"],
    geometryWGS84: {} as DistancePointEntry["geometryWGS84"],
  } as DistancePointEntry);

const createNodeChain = (
  id: string,
  type: NodeChainAnnotation["type"],
  nodeIds: string[]
): NodeChainAnnotation => ({
  id,
  type,
  nodeIds,
  edgeRelationIds: [],
  closed: type !== ANNOTATION_TYPE_POLYLINE,
  planeLocked: false,
});

describe("resolveAnnotationInfoBoxSubject", () => {
  it("prefers the selected node-chain annotation over stale point fallback in select mode", () => {
    const lastPoint = createPointMeasurement("point-1");
    const selectedPolygon = createNodeChain(
      "polygon-1",
      ANNOTATION_TYPE_AREA_GROUND,
      ["node-a", "node-b", "node-c"]
    );

    const result = resolveAnnotationInfoBoxSubject({
      activeToolType: SELECT_TOOL_TYPE,
      pointEntries: [lastPoint],
      polylineAnnotations: [],
      groundPolygons: [selectedPolygon],
      planarPolygons: [],
      verticalPolygons: [],
      primarySelectedAnnotationId: "node-c",
      currentEditingAnnotationId: null,
      openChainPointId: null,
      pendingLabelPlacementAnnotationId: null,
      activeNodeChainAnnotationId: null,
      focusedNodeChainAnnotationId: selectedPolygon.id,
    });

    expect(result.kind).toBe(ANNOTATION_TYPE_AREA_GROUND);
    expect(result.annotationId).toBe(selectedPolygon.id);
  });

  it("returns unsupported when select mode has no focused annotation", () => {
    const result = resolveAnnotationInfoBoxSubject({
      activeToolType: SELECT_TOOL_TYPE,
      pointEntries: [createPointMeasurement("point-1")],
      polylineAnnotations: [],
      groundPolygons: [],
      planarPolygons: [],
      verticalPolygons: [],
      primarySelectedAnnotationId: null,
      currentEditingAnnotationId: null,
      openChainPointId: null,
      pendingLabelPlacementAnnotationId: null,
      activeNodeChainAnnotationId: null,
      focusedNodeChainAnnotationId: null,
    });

    expect(result.kind).toBe("unsupported");
    expect(result.annotationId).toBeNull();
  });

  it("keeps label mode bound to the pending label placement measurement", () => {
    const pendingLabel = createPointMeasurement("label-1", {
      auxiliaryLabelAnchor: true,
    });

    const result = resolveAnnotationInfoBoxSubject({
      activeToolType: ANNOTATION_TYPE_LABEL,
      pointEntries: [pendingLabel],
      polylineAnnotations: [],
      groundPolygons: [],
      planarPolygons: [],
      verticalPolygons: [],
      primarySelectedAnnotationId: null,
      currentEditingAnnotationId: null,
      openChainPointId: null,
      pendingLabelPlacementAnnotationId: pendingLabel.id,
      activeNodeChainAnnotationId: null,
      focusedNodeChainAnnotationId: null,
    });

    expect(result.kind).toBe(ANNOTATION_TYPE_LABEL);
    expect(result.annotationId).toBe(pendingLabel.id);
  });

  it("falls back to the last displayable polyline in polyline mode", () => {
    const polyline = createNodeChain("polyline-1", ANNOTATION_TYPE_POLYLINE, [
      "a",
      "b",
    ]);

    const result = resolveAnnotationInfoBoxSubject({
      activeToolType: ANNOTATION_TYPE_POLYLINE,
      pointEntries: [createDistanceMeasurement("distance-1")],
      polylineAnnotations: [polyline],
      groundPolygons: [],
      planarPolygons: [],
      verticalPolygons: [],
      primarySelectedAnnotationId: null,
      currentEditingAnnotationId: null,
      openChainPointId: null,
      pendingLabelPlacementAnnotationId: null,
      activeNodeChainAnnotationId: null,
      focusedNodeChainAnnotationId: null,
    });

    expect(result.kind).toBe(ANNOTATION_TYPE_POLYLINE);
    expect(result.annotationId).toBe(polyline.id);
  });
});
