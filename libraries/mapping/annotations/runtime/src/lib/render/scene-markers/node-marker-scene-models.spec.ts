import {
  labelOverlayAffordanceDefaults,
  POINT_LABEL_OCCLUDED_OPACITY,
} from "@carma-providers/label-overlay";
import { Vector3 } from "three";
import { describe, expect, it } from "vitest";

import { createLiveAnnotationAnchors } from "../../interaction/live-annotation-anchors";
import {
  RUNTIME_AREA_LABEL_FIT_ROLE,
  type RuntimePointLabelRenderModel,
  type RuntimePointMarkerRenderModel,
} from "../annotation-render-models";
import { AREA_LABEL_OCCLUDED_OPACITY } from "../area-label-size";
import {
  LABEL_STEM_SCENE_DEFAULTS,
  resolveLabelStemSceneStyle,
} from "../label-stem-scene-lines";
import { resolvePointLabelOcclusionLook } from "../point-label-overlay-state";
import {
  buildLabelMarkerSceneModels,
  buildPointMarkerSceneModels,
  type LabelMarkerAnchor,
} from "./node-marker-scene-models";
import { resolvePlacedSceneMarkerStyle } from "./scene-marker-models";

const coordinate = { longitude: 7.2, latitude: 51.27, altitude: 150 };
const anchorECEF = new Vector3(4_000_000, 500_000, 4_900_000);
const liveAnchors = createLiveAnnotationAnchors(() => undefined);

const label = {
  id: "p1",
  coordinate,
  content: "1.00 m",
  markerSize: 10,
  markerStrokeWidth: 1,
} as RuntimePointLabelRenderModel & {
  markerSize: number;
  markerStrokeWidth: number;
};

/** The label's scene marker, scene stem and pill as one anchor verdict draws them. */
const drawLabel = (anchor: LabelMarkerAnchor) => {
  const look = resolvePointLabelOcclusionLook(label, anchor.isOccluded);
  const [marker] = buildLabelMarkerSceneModels(
    [label],
    liveAnchors,
    () => anchor
  );
  const placement = marker!.place();
  return {
    placement,
    marker: resolvePlacedSceneMarkerStyle(marker!, placement),
    stem: resolveLabelStemSceneStyle("white", look),
    pillOpacity: look.opacity,
  };
};

describe("one anchor verdict for a label's marker, stem and pill", () => {
  it("draws a visible anchor's marker filled, its stem solid and its pill opaque", () => {
    const { placement, marker, stem, pillOpacity } = drawLabel({
      visible: true,
      anchorECEF,
      isOccluded: false,
    });
    expect(placement?.positionECEF).toBe(anchorECEF);
    expect(marker).toMatchObject({ occluded: false, opacity: 1 });
    expect(stem.dash).toBeUndefined();
    expect(stem.opacity).toBe(1);
    expect(pillOpacity).toBe(1);
  });

  it("draws a hidden anchor's marker dotted, its stem dashed, all three at the occluded opacity", () => {
    const { marker, stem, pillOpacity } = drawLabel({
      visible: true,
      anchorECEF,
      isOccluded: true,
    });
    expect(marker).toMatchObject({
      occluded: true,
      opacity: POINT_LABEL_OCCLUDED_OPACITY,
    });
    expect(stem.overlay).toBe(true);
    expect(stem.dash).toEqual(LABEL_STEM_SCENE_DEFAULTS.occludedDash);
    expect(stem.opacity).toBe(POINT_LABEL_OCCLUDED_OPACITY);
    expect(pillOpacity).toBe(POINT_LABEL_OCCLUDED_OPACITY);
  });

  it("hides the marker with its label", () => {
    expect(
      drawLabel({ visible: false, isOccluded: true }).placement
    ).toBeNull();
  });

  it("fades an occluded area value to its own opacity", () => {
    const areaFit = {
      key: "area",
      role: RUNTIME_AREA_LABEL_FIT_ROLE.INSIDE,
      outline: [],
    };
    expect(resolvePointLabelOcclusionLook({ areaFit }, true)).toEqual({
      isOccluded: true,
      opacity: AREA_LABEL_OCCLUDED_OPACITY,
    });
    expect(resolvePointLabelOcclusionLook({ areaFit }, false).opacity).toBe(1);
  });
});

describe("buildPointMarkerSceneModels", () => {
  const point = (id: string): RuntimePointMarkerRenderModel => ({
    id,
    coordinate,
    pixelSize: 10,
    fill: "transparent",
    outline: "white",
    outlineWidth: 1,
  });

  it("draws each node marker whole in its node's verdict, hovered or not", () => {
    const occludedIds = new Set(["b"]);
    const [visible, occluded] = buildPointMarkerSceneModels(
      [point("a"), point("b")],
      liveAnchors,
      new Set(["b"]),
      (pointId) => occludedIds.has(pointId)
    );
    expect(
      resolvePlacedSceneMarkerStyle(visible!, visible!.place())
    ).toMatchObject({ occluded: false, opacity: 1, sizePx: 10 });
    expect(
      resolvePlacedSceneMarkerStyle(occluded!, occluded!.place())
    ).toMatchObject({
      occluded: true,
      opacity: 1,
      scale: labelOverlayAffordanceDefaults.hover.scale,
    });

    occludedIds.delete("b");
    expect(occluded!.place()?.occluded).toBe(false);
  });
});
