import { describe, expect, it } from "vitest";

import {
  ANNOTATION_SELECT_TOOL_ID,
  ANNOTATION_TYPES,
} from "@carma-mapping/annotations/core";
import { ANNOTATION_INFO_BOX_ACTION_IDS } from "@carma-mapping/annotations/ui";
import {
  RUNTIME_ANNOTATION_INFO_BOX_SLOT_STATE_KINDS,
  type RuntimeAnnotationInfoBoxVisualOptionsContext,
} from "@carma-mapping/annotations/runtime";

import {
  GEOPORTAL_ANNOTATION_DEVELOPMENT_PREVIEW_HEADER_STYLE,
  GEOPORTAL_ANNOTATION_DEVELOPMENT_PREVIEW_PATTERN_OPTIONS,
  isGeoportalDevelopmentPreviewAnnotationToolId,
  resolveGeoportalAnnotationInfoBoxVisualOptions,
} from "./annotation-info-box-visual-options";

const createAnnotationContext = (toolType: string) =>
  ({
    kind: RUNTIME_ANNOTATION_INFO_BOX_SLOT_STATE_KINDS.ANNOTATION,
    annotation: {
      toolType,
    },
  } as unknown as RuntimeAnnotationInfoBoxVisualOptionsContext);

describe("resolveGeoportalAnnotationInfoBoxVisualOptions", () => {
  it("keeps Cismap point and distance visual tweaks outside the component", () => {
    expect(
      resolveGeoportalAnnotationInfoBoxVisualOptions(
        createAnnotationContext(ANNOTATION_TYPES.POINT)
      ).hiddenActionIds
    ).not.toContain(ANNOTATION_INFO_BOX_ACTION_IDS.REFERENCE);
    expect(
      resolveGeoportalAnnotationInfoBoxVisualOptions(
        createAnnotationContext(ANNOTATION_TYPES.DISTANCE)
      ).showSubtitleMetaText
    ).toBe(false);
  });

  it("keeps the toolbar development preview pattern options app-level", () => {
    expect(GEOPORTAL_ANNOTATION_DEVELOPMENT_PREVIEW_PATTERN_OPTIONS).toEqual({
      backgroundColor: "transparent",
      primaryColor: "rgba(0, 0, 0, 0.1)",
      rotationDeg: 45,
      secondaryColor: "transparent",
      stripeGapPx: 5,
      stripeWidthPx: 5,
      textVisible: false,
    });
  });

  it("marks preview annotation tool info box headers with the same neutral pattern", () => {
    expect(
      resolveGeoportalAnnotationInfoBoxVisualOptions(
        createAnnotationContext(ANNOTATION_TYPES.AREA_PLANAR)
      )
    ).toEqual(
      expect.objectContaining({
        headerForegroundClassName: "text-[#374151]",
        headerStyle: GEOPORTAL_ANNOTATION_DEVELOPMENT_PREVIEW_HEADER_STYLE,
        headingColor: "rgba(255, 255, 255, 0.88)",
      })
    );

    expect(
      resolveGeoportalAnnotationInfoBoxVisualOptions(
        createAnnotationContext(ANNOTATION_TYPES.DISTANCE)
      ).headerStyle
    ).toBeUndefined();
  });

  it("identifies Geoportal preview annotation tool ids from the stable tool config", () => {
    expect(
      isGeoportalDevelopmentPreviewAnnotationToolId(
        ANNOTATION_TYPES.AREA_PLANAR
      )
    ).toBe(true);
    expect(
      isGeoportalDevelopmentPreviewAnnotationToolId(ANNOTATION_TYPES.POINT)
    ).toBe(false);
    expect(
      isGeoportalDevelopmentPreviewAnnotationToolId(ANNOTATION_TYPES.DISTANCE)
    ).toBe(false);
    expect(
      isGeoportalDevelopmentPreviewAnnotationToolId(ANNOTATION_SELECT_TOOL_ID)
    ).toBe(false);
  });
});
