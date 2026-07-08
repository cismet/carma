// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  ANNOTATION_INFO_BOX_HELP_ACTION_INDICATORS,
  ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS,
  ANNOTATION_INFO_BOX_HELP_ALERT_SEVERITIES,
  ANNOTATION_INFO_BOX_HELP_ITEM_KINDS,
  ANNOTATION_INFO_BOX_HELP_LAYOUTS,
  AnnotationInfoBoxHelpContent,
} from "./AnnotationInfoBoxHelpContent";

describe("AnnotationInfoBoxHelpContent", () => {
  it("renders structured actions with explicit input alternatives and combinations", () => {
    render(
      <AnnotationInfoBoxHelpContent
        locale="en-US"
        platform="windows"
        items={[
          {
            kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.TEXT,
            text: "Dritten Punkt auf der parallelen Gegenkante anklicken.",
          },
          {
            kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.ACTION,
            inputAlternatives: [[ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.CLICK]],
            description: "Setzt den dritten Punkt.",
          },
          {
            kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.ACTION,
            inputAlternatives: [
              [
                ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.BACKSPACE,
                ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.ENTER,
              ],
              [ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.DOUBLE_CLICK],
            ],
            description: "Löscht den letzten Punkt.",
          },
          {
            kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.ACTION,
            inputAlternatives: [
              [ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.DOUBLE_CLICK],
              [ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.ENTER],
            ],
            description: "Schliesst die Trapezfläche.",
          },
        ]}
      />
    );

    const actionRows = screen.getAllByTestId("annotation-help-action");

    expect(
      screen.getByText("Dritten Punkt auf der parallelen Gegenkante anklicken.")
    ).toBeTruthy();
    expect(actionRows).toHaveLength(3);
    expect(actionRows[0]?.textContent).toContain("Click");
    expect(actionRows[1]?.textContent).toContain("←");
    expect(actionRows[1]?.textContent).toContain("Backspace");
    expect(actionRows[1]?.textContent).toContain("+");
    expect(actionRows[1]?.textContent).toContain("or");
    expect(actionRows[2]?.textContent).toContain("Double click");
    expect(actionRows[2]?.textContent).toContain("or");
    expect(actionRows[2]?.textContent).toContain("Enter");
  });

  it("uses localized backspace labels on Windows-style keyboards", () => {
    render(
      <AnnotationInfoBoxHelpContent
        locale="de-DE"
        platform="windows"
        items={[
          {
            kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.ACTION,
            inputAlternatives: [
              [ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.BACKSPACE],
            ],
            description: "Löscht den letzten Punkt.",
          },
        ]}
      />
    );

    const actionRows = screen.getAllByTestId("annotation-help-action");

    expect(actionRows[0]?.textContent).toContain("←");
    expect(actionRows[0]?.textContent).toContain("Rücktaste");
    expect(actionRows[0]?.textContent).not.toContain("Backspace");
  });

  it("uses the macOS backspace glyph on Apple keyboards, same label", () => {
    render(
      <AnnotationInfoBoxHelpContent
        locale="de-DE"
        platform="macos"
        items={[
          {
            kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.ACTION,
            inputAlternatives: [
              [ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.BACKSPACE],
            ],
            description: "Löscht den letzten Punkt.",
          },
        ]}
      />
    );

    const actionRows = screen.getAllByTestId("annotation-help-action");

    // Same localized label as Windows, OS-appropriate glyph (⌫ vs ←).
    expect(actionRows[0]?.textContent).toContain("⌫");
    expect(actionRows[0]?.textContent).toContain("Rücktaste");
    expect(actionRows[0]?.textContent).not.toContain("←");
  });

  it("uses localized keyboard labels when a locale is provided", () => {
    render(
      <AnnotationInfoBoxHelpContent
        locale="de-DE"
        platform="macos"
        items={[
          {
            kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.ACTION,
            inputAlternatives: [
              [ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.BACKSPACE],
            ],
            description: "Löscht den letzten Punkt.",
          },
          {
            kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.ACTION,
            inputAlternatives: [
              [ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.ESCAPE],
            ],
            description: "Beendet das Werkzeug.",
          },
        ]}
      />
    );

    const actionRows = screen.getAllByTestId("annotation-help-action");

    expect(actionRows[0]?.textContent).toContain("⌫");
    expect(actionRows[0]?.textContent).not.toContain("Backspace");
    expect(actionRows[1]?.textContent).toContain("Esc");
  });

  it("renders compact action alternatives in the button column", () => {
    render(
      <AnnotationInfoBoxHelpContent
        layout={ANNOTATION_INFO_BOX_HELP_LAYOUTS.COMPACT}
        locale="de-DE"
        platform="windows"
        items={[
          {
            kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.ACTION,
            inputAlternatives: [
              [ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.DOUBLE_CLICK],
              [ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.ENTER],
            ],
            description: "Schliesst die Trapezfläche.",
          },
        ]}
      />
    );

    const content = screen.getByTestId("annotation-help-content");
    const actionRow = screen.getByTestId("annotation-help-action");

    expect(content.style.gridTemplateColumns).toBe(
      "max-content minmax(0, 1fr)"
    );
    expect(content.style.columnGap).toBe("1em");
    expect(actionRow.textContent).toContain("2x Klick");
    expect(actionRow.textContent).toContain("oder");
    expect(actionRow.textContent).toContain("Enter");
  });

  it("renders informative action indicators in the input column", () => {
    render(
      <AnnotationInfoBoxHelpContent
        locale="en-US"
        platform="windows"
        items={[
          {
            kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.ACTION,
            indicator: ANNOTATION_INFO_BOX_HELP_ACTION_INDICATORS.INFO,
            inputAlternatives: [[ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.SHIFT]],
            description: "Hold to override limiters.",
          },
        ]}
      />
    );

    const actionRow = screen.getByTestId("annotation-help-action");
    const icon = actionRow.querySelector(".fa-circle-info");

    expect(icon).toBeTruthy();
    expect(actionRow.textContent).toContain("Shift");
    expect(actionRow.textContent).toContain("Hold to override limiters.");
  });

  it("renders alert text and actions as one severity block", () => {
    render(
      <AnnotationInfoBoxHelpContent
        layout={ANNOTATION_INFO_BOX_HELP_LAYOUTS.COMPACT}
        locale="en-US"
        platform="windows"
        items={[
          {
            kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.ALERT,
            severity: ANNOTATION_INFO_BOX_HELP_ALERT_SEVERITIES.WARNING,
            text: "Point cannot be accepted.",
            actions: [
              {
                kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.ACTION,
                inputAlternatives: [
                  [ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.SHIFT],
                ],
                description: "Hold to project onto the helper disk.",
              },
            ],
          },
        ]}
      />
    );

    const alert = screen.getByTestId("annotation-help-alert");

    expect(alert.getAttribute("data-severity")).toBe("warning");
    expect(alert.style.gridTemplateColumns).toBe("subgrid");
    expect(alert.style.background).toBe("rgba(239, 68, 68, 0.18)");
    expect(alert.querySelector(".fa-circle-exclamation")).toBeTruthy();
    expect(alert.textContent).toContain("Point cannot be accepted.");
    expect(alert.textContent).toContain("Shift");
    expect(alert.textContent).toContain(
      "Hold to project onto the helper disk."
    );
  });

  it("uses the sampling guide tone for info alert backdrops", () => {
    render(
      <AnnotationInfoBoxHelpContent
        items={[
          {
            kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.ALERT,
            severity: ANNOTATION_INFO_BOX_HELP_ALERT_SEVERITIES.INFO,
            text: "Point is snapped to a right angle.",
          },
        ]}
      />
    );

    const alert = screen.getByTestId("annotation-help-alert");

    expect(alert.getAttribute("data-severity")).toBe("info");
    expect(alert.style.background).toBe("rgba(0, 217, 255, 0.2)");
  });

  it("moves leading state alerts after the main instruction text", () => {
    render(
      <AnnotationInfoBoxHelpContent
        layout={ANNOTATION_INFO_BOX_HELP_LAYOUTS.COMPACT}
        locale="en-US"
        platform="windows"
        items={[
          {
            kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.ALERT,
            severity: ANNOTATION_INFO_BOX_HELP_ALERT_SEVERITIES.INFO,
            text: "Shift is active.",
          },
          {
            kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.TEXT,
            text: "Click the second point.",
          },
          {
            kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.ACTION,
            inputAlternatives: [[ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.CLICK]],
            description: "Sets the base edge.",
          },
        ]}
      />
    );

    const content = screen.getByTestId("annotation-help-content");
    const alert = screen.getByTestId("annotation-help-alert");
    const action = screen.getByTestId("annotation-help-action");

    expect(content.children[0]?.textContent).toContain(
      "Click the second point."
    );
    expect(content.children[1]).toBe(alert);
    expect(content.children[2]).toBe(action);
  });
});
