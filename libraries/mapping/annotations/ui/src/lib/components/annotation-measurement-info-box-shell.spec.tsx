import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { buildAnnotationMeasurementInfoBoxSlots } from "./AnnotationMeasurementInfoBoxShell";

const buildRequiredShellProps = () =>
  ({
    headingTitle: "Messung",
    titleInput: {
      value: "",
      placeholder: "Messung",
      onCommit: vi.fn(),
    },
    actions: {
      hidden: false,
      locked: false,
      onFlyTo: vi.fn(),
      onExport: vi.fn(),
      onToggleVisibility: vi.fn(),
      onToggleLock: vi.fn(),
      onDelete: vi.fn(),
    },
  } as const);

const queryEmptyContentLine = (container: HTMLElement) =>
  container.querySelector(
    '[data-test-id="annotation-info-box-empty-content-line"]'
  ) as HTMLDivElement | null;

describe("buildAnnotationMeasurementInfoBoxSlots", () => {
  it("renders a default empty content line when content is unavailable", () => {
    const slots = buildAnnotationMeasurementInfoBoxSlots({
      ...buildRequiredShellProps(),
      content: null,
    });

    const { container } = render(
      <>
        {slots.subtitle}
        {slots.content}
      </>
    );

    const emptyLine = queryEmptyContentLine(container);

    expect(emptyLine?.style.minHeight).toBe("1.4em");
  });

  it("treats empty fragments as unavailable content", () => {
    const slots = buildAnnotationMeasurementInfoBoxSlots({
      ...buildRequiredShellProps(),
      content: <>{null}</>,
    });

    const { container } = render(
      <>
        {slots.subtitle}
        {slots.content}
      </>
    );

    expect(queryEmptyContentLine(container)).toBeTruthy();
  });

  it("allows the default empty content line style to be overridden", () => {
    const slots = buildAnnotationMeasurementInfoBoxSlots({
      ...buildRequiredShellProps(),
      content: undefined,
      visualOptions: {
        emptyContentLineStyle: {
          minHeight: "2rem",
        },
        emptyContentLineClassName: "custom-empty-line",
      },
    });

    const { container } = render(
      <>
        {slots.subtitle}
        {slots.content}
      </>
    );

    const emptyLine = queryEmptyContentLine(container);

    expect(emptyLine?.className).toContain("custom-empty-line");
    expect(emptyLine?.style.minHeight).toBe("2rem");
  });
});
