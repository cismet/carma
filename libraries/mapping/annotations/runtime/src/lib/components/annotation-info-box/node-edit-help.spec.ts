import { describe, expect, it } from "vitest";
import {
  ANNOTATION_INFO_BOX_HELP_ITEM_KINDS,
  type AnnotationInfoBoxHelpActionItem,
  type AnnotationInfoBoxHelpHeadingItem,
} from "@carma-mapping/annotations/ui";
import { ANNOTATION_TYPES } from "@carma-mapping/annotations/core";

import { resolveNodeEditHelpItems } from "./node-edit-help";

const headings = (
  items: readonly { kind: string }[]
): AnnotationInfoBoxHelpHeadingItem[] =>
  items.filter(
    (item): item is AnnotationInfoBoxHelpHeadingItem =>
      item.kind === ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.HEADING
  );

const actions = (
  items: readonly { kind: string }[]
): AnnotationInfoBoxHelpActionItem[] =>
  items.filter(
    (item): item is AnnotationInfoBoxHelpActionItem =>
      item.kind === ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.ACTION
  );

describe("resolveNodeEditHelpItems", () => {
  it("leads with the Bearbeitungsmodus title and two section headings", () => {
    const items = resolveNodeEditHelpItems({
      toolType: ANNOTATION_TYPES.DISTANCE,
    });
    const headingTexts = headings(items).map((heading) => heading.text);

    expect(items[0]).toMatchObject({
      kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.HEADING,
      text: "Bearbeitungsmodus",
      level: "title",
    });
    expect(headingTexts).toEqual([
      "Bearbeitungsmodus",
      "Punkt verschieben durch ziehen von",
      "Weitere Funktionen",
    ]);
    // No trailing colons on any heading.
    headings(items).forEach((heading) => {
      expect(heading.text).not.toContain(":");
    });
  });

  it("labels the drag targets and puts the arrow effect on the right", () => {
    const items = resolveNodeEditHelpItems({
      toolType: ANNOTATION_TYPES.DISTANCE,
    });
    const dragActions = actions(items).filter((action) =>
      Boolean(action.leadingLabel)
    );

    expect(dragActions.map((action) => action.leadingLabel)).toEqual([
      "Scheibenmitte",
      "Äußere Scheibe",
      "Blaue Pfeilspitzen",
    ]);
    dragActions.forEach((action) => {
      expect(action.description.startsWith("→")).toBe(true);
    });
  });

  it("deletes the whole measurement for point and distance", () => {
    for (const toolType of [
      ANNOTATION_TYPES.POINT,
      ANNOTATION_TYPES.DISTANCE,
    ] as const) {
      const items = resolveNodeEditHelpItems({ toolType });
      const deleteAction = actions(items).find((action) =>
        action.inputAlternatives.some((combination) =>
          combination.includes("backspace")
        )
      );
      expect(deleteAction?.description).toBe("Messung löschen");
    }
  });

  it("keeps per-node delete wording for polyline (aligned, not yet live)", () => {
    const items = resolveNodeEditHelpItems({
      toolType: ANNOTATION_TYPES.POLYLINE,
    });
    const deleteAction = actions(items).find((action) =>
      action.inputAlternatives.some((combination) =>
        combination.includes("backspace")
      )
    );
    expect(deleteAction?.description).toContain("Punkt löschen");
  });

  it("offers height adoption for line/area but not for a single point", () => {
    const lineItems = resolveNodeEditHelpItems({
      toolType: ANNOTATION_TYPES.DISTANCE,
    });
    const pointItems = resolveNodeEditHelpItems({
      toolType: ANNOTATION_TYPES.POINT,
    });
    const hasAdoptHeight = (items: ReturnType<typeof resolveNodeEditHelpItems>) =>
      actions(items).some((action) =>
        action.description.includes("Höhe des Punktes übernehmen")
      );

    expect(hasAdoptHeight(lineItems)).toBe(true);
    expect(hasAdoptHeight(pointItems)).toBe(false);
  });

  it("returns nothing for non-node-edited geometries", () => {
    expect(
      resolveNodeEditHelpItems({ toolType: ANNOTATION_TYPES.LABEL })
    ).toEqual([]);
  });
});
