import { buildDistanceTriangleLineLabelReferences } from "@carma-mapping/annotations/core";
import type { Rect } from "@carma-providers/label-overlay";
import type { CssPixelPosition } from "@carma-units";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { annotationLineLabelDefaults } from "../config/annotation-line-label-options";
import {
  createSegmentLineLabels,
  type AuthoringSegmentLineLabels,
} from "../interaction/authoring-line-label";
import {
  reconcileSecondaryLineLabelVisibility,
  type SecondaryLineLabelConflictCandidate,
} from "./secondary-line-label-conflict-resolution";

const point = (x: number, y: number) => ({ x, y } as CssPixelPosition);

// One frame of the Geoportal Cesium view used for the dev parity check: a
// 35,71 m distance whose triangle has a 12,28 m vertical and a 33,54 m
// horizontal leg (screen positions as projected in that view).
const anchor = point(599.4, 500.3);
const aux = point(595, 449.5);
const target = point(800, 434.5);

// Unrotated label box as measured in the browser for "33,54 m".
const labelBox = { width: 60, height: 22 };

// Point label pills ("1 NHN 154,61 m" and "A") after their layout pass ...
const laidOutPointLabelRects: Rect[] = [
  { left: 775, top: 568, right: 904, bottom: 596 },
  { left: 815, top: 404, right: 843, bottom: 432 },
];
// ... and in the frame before it, stacked at their pre-layout spot.
const preLayoutPointLabelRects: Rect[] = [
  { left: 710, top: 408, right: 839, bottom: 436 },
  { left: 710, top: 408, right: 738, bottom: 436 },
];

const labelTransformPattern =
  /^translate\((-?[\d.]+)px, (-?[\d.]+)px\) translate\(-50%, -50%\) rotate\((-?[\d.]+)rad\)$/;

/** The axis-aligned box a centred, rotated label covers, as the browser reports it. */
const resolveLabelLayoutRect = (element: HTMLElement) => {
  const match = element.style.transform.match(labelTransformPattern);
  if (element.style.display === "none" || !match) {
    return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
  }

  const [centerX, centerY, angleRad] = match.slice(1).map(Number);
  const width =
    Math.abs(labelBox.width * Math.cos(angleRad)) +
    Math.abs(labelBox.height * Math.sin(angleRad));
  const height =
    Math.abs(labelBox.width * Math.sin(angleRad)) +
    Math.abs(labelBox.height * Math.cos(angleRad));

  return {
    left: centerX - width / 2,
    top: centerY - height / 2,
    right: centerX + width / 2,
    bottom: centerY + height / 2,
    width,
    height,
  };
};

const buildLegLabelCandidates = (
  labels: AuthoringSegmentLineLabels
): SecondaryLineLabelConflictCandidate[] => {
  const references = buildDistanceTriangleLineLabelReferences({
    anchor,
    target,
    aux,
    anchorAltitudeMeters: 142.33,
    targetAltitudeMeters: 154.61,
  });
  const annotationId = "distance-1";

  return [
    {
      element: labels.direct,
      zIndex: 909,
      annotationId,
      metricValueMeters: 35.71,
      text: "35,71 m",
      start: anchor,
      end: target,
      outsideReferencePoint: references.directOutsideReferencePoint,
    },
    {
      element: labels.vertical,
      zIndex: 909,
      annotationId,
      metricValueMeters: 12.28,
      text: "12,28 m",
      start: anchor,
      end: aux,
      outsideReferencePoint: references.verticalOutsideReferencePoint,
    },
    {
      element: labels.horizontal,
      zIndex: 911,
      annotationId,
      metricValueMeters: 33.54,
      text: "33,54 m",
      start: aux,
      end: target,
      outsideReferencePoint: references.horizontalOutsideReferencePoint,
    },
  ];
};

/** One per-frame pass of the edge label overlay over the triangle's leg labels. */
const placeLegLabels = (
  labels: AuthoringSegmentLineLabels,
  occupiedPointLabelRects: readonly Rect[]
) => {
  const { collision } = annotationLineLabelDefaults;
  reconcileSecondaryLineLabelVisibility({
    candidates: buildLegLabelCandidates(labels),
    occupiedLabelRects: [...occupiedPointLabelRects],
    allowEarlyRemoval: collision.allowEarlyRemoval,
    collisionResolutionStrategy: collision.resolutionStrategy,
    anchorSlideStepRatio: collision.anchorSlideStepRatio,
    maxAnchorSlideDeltaRatio: collision.maxAnchorSlideDeltaRatio,
  });
};

const readAnchorRatio = (element: HTMLDivElement) =>
  element.style.display === "none"
    ? null
    : Number(element.dataset.annotationOverlayLineLabelAnchorRatio);

describe("distance triangle leg label placement", () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        return resolveLabelLayoutRect(this) as DOMRect;
      }
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps every label at its leg midpoint next to the laid-out point labels", () => {
    const labels = createSegmentLineLabels();

    placeLegLabels(labels, laidOutPointLabelRects);

    expect(readAnchorRatio(labels.direct)).toBe(0.5);
    expect(readAnchorRatio(labels.vertical)).toBe(0.5);
    expect(readAnchorRatio(labels.horizontal)).toBe(0.5);
    // label centre as measured in the browser (x 697 on the 595..800 leg)
    expect(labels.horizontal.style.transform).toMatch(
      /^translate\(697px, 433px\)/
    );
  });

  it("slides the horizontal leg label to 0.3 while the point label pills sit at their pre-layout spot", () => {
    const labels = createSegmentLineLabels();

    placeLegLabels(labels, preLayoutPointLabelRects);

    expect(readAnchorRatio(labels.direct)).toBe(0.5);
    expect(readAnchorRatio(labels.vertical)).toBe(0.5);
    expect(readAnchorRatio(labels.horizontal)).toBeCloseTo(0.3, 6);
    expect(labels.horizontal.style.transform).toMatch(
      /^translate\(656px, 436px\)/
    );
  });

  it("moves a slid label back to its midpoint on the next pass over the laid-out point labels", () => {
    const labels = createSegmentLineLabels();

    placeLegLabels(labels, preLayoutPointLabelRects);
    placeLegLabels(labels, laidOutPointLabelRects);

    expect(readAnchorRatio(labels.horizontal)).toBe(0.5);
  });
});
