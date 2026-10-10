import { ANNOTATION_TYPES } from "@carma-mapping/annotations/core";

import {
  ANNOTATION_NODE_EDIT_FRAMES,
  ANNOTATION_NODE_EDIT_RULES,
  resolveAnnotationNodeEditRule,
  resolveEditedMeasurementForNode,
} from "./annotation-node-edit-rules";

describe("ANNOTATION_NODE_EDIT_RULES", () => {
  it("covers every measurement type", () => {
    for (const type of Object.values(ANNOTATION_TYPES)) {
      expect(ANNOTATION_NODE_EDIT_RULES[type]).toBeDefined();
    }
  });

  it("moves points, lines and labels freely with height arrows and surface drag", () => {
    for (const type of [
      ANNOTATION_TYPES.POINT,
      ANNOTATION_TYPES.DISTANCE,
      ANNOTATION_TYPES.POLYLINE,
      ANNOTATION_TYPES.LABEL,
    ]) {
      expect(ANNOTATION_NODE_EDIT_RULES[type]).toEqual({
        frame: ANNOTATION_NODE_EDIT_FRAMES.FREE,
        axes: true,
        surfaceDrag: true,
        projectOntoMeasurementPlane: false,
      });
    }
  });

  it("keeps footprint corners horizontal without height arrows", () => {
    expect(ANNOTATION_NODE_EDIT_RULES[ANNOTATION_TYPES.AREA_GROUND]).toEqual({
      frame: ANNOTATION_NODE_EDIT_FRAMES.GROUND,
      axes: false,
      surfaceDrag: true,
      projectOntoMeasurementPlane: false,
    });
  });

  it("holds roof and wall corners to their plane, without arrows or surface drag", () => {
    for (const type of [
      ANNOTATION_TYPES.AREA_PLANAR,
      ANNOTATION_TYPES.AREA_VERTICAL,
    ]) {
      expect(ANNOTATION_NODE_EDIT_RULES[type]).toEqual({
        frame: ANNOTATION_NODE_EDIT_FRAMES.MEASUREMENT_PLANE,
        axes: false,
        surfaceDrag: false,
        projectOntoMeasurementPlane: true,
      });
    }
  });

  it("edits an unknown type freely", () => {
    expect(resolveAnnotationNodeEditRule("unknown").frame).toBe(
      ANNOTATION_NODE_EDIT_FRAMES.FREE
    );
    expect(resolveAnnotationNodeEditRule(undefined).frame).toBe(
      ANNOTATION_NODE_EDIT_FRAMES.FREE
    );
  });
});

describe("resolveEditedMeasurementForNode", () => {
  const roof = { id: "roof", toolType: "planar", nodeIds: ["a", "b", "c"] };
  const line = { id: "line", toolType: "distance", nodeIds: ["c", "d"] };
  const entries = [roof, line];

  it("takes the latest selected measurement that holds the node", () => {
    expect(
      resolveEditedMeasurementForNode("c", entries, ["roof", "line"])
    ).toBe(line);
    expect(
      resolveEditedMeasurementForNode("c", entries, ["line", "roof"])
    ).toBe(roof);
  });

  it("does not hand a shared node to the roof while the line is edited", () => {
    expect(resolveEditedMeasurementForNode("c", entries, ["line"])).toBe(line);
  });

  it("falls back to the first holder without a matching selection", () => {
    expect(resolveEditedMeasurementForNode("c", entries, [])).toBe(roof);
    expect(resolveEditedMeasurementForNode("x", entries, ["roof"])).toBeNull();
  });
});
