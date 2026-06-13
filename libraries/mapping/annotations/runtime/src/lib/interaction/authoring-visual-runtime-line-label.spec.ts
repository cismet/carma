import { describe, expect, it } from "vitest";

import { annotationOverlayDefaults } from "../config/annotation-overlay-defaults";
import {
  applyLineLabel,
  createSegmentLineLabels,
} from "./authoring-visual-runtime";

const extractTranslate = (transform: string) => {
  const match = transform.match(
    /^translate\((-?\d+(?:\.\d+)?)px, (-?\d+(?:\.\d+)?)px\)/
  );

  if (!match) {
    throw new Error(`Unexpected transform: ${transform}`);
  }

  return {
    x: Number(match[1]),
    y: Number(match[2]),
  };
};

const applyDistanceComponentLabels = (outsideReferenceY: number) => {
  const labels = createSegmentLineLabels();
  const start = { x: 0, y: 0 };
  const end = { x: 100, y: 0 };
  const outsideReferencePoint = { x: 50, y: outsideReferenceY };

  applyLineLabel({
    element: labels.direct,
    text: "100 m",
    start,
    end,
    outsideReferencePoint,
  });
  applyLineLabel({
    element: labels.vertical,
    text: "100 m",
    start,
    end,
    outsideReferencePoint,
  });
  applyLineLabel({
    element: labels.horizontal,
    text: "100 m",
    start,
    end,
    outsideReferencePoint,
  });

  return {
    direct: extractTranslate(labels.direct.style.transform),
    vertical: extractTranslate(labels.vertical.style.transform),
    horizontal: extractTranslate(labels.horizontal.style.transform),
  };
};

describe("distance component line labels", () => {
  it("uses the same offset for all component labels above the line", () => {
    const positions = applyDistanceComponentLabels(40);

    expect(positions.direct).toEqual({
      x: 50,
      y: annotationOverlayDefaults.lineLabelOffsetPx,
    });
    expect(positions.vertical).toEqual(positions.direct);
    expect(positions.horizontal).toEqual(positions.direct);
  });

  it("uses the same offset for all component labels below the line", () => {
    const positions = applyDistanceComponentLabels(-40);

    expect(positions.direct).toEqual({
      x: 50,
      y: -annotationOverlayDefaults.lineLabelOffsetPx,
    });
    expect(positions.vertical).toEqual(positions.direct);
    expect(positions.horizontal).toEqual(positions.direct);
  });
});
