import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ANNOTATION_INFO_BOX_ACTION_IDS } from "../annotation-info-box.types";
import { buildAnnotationInfoBoxSlots } from "./AnnotationInfoBoxShell";

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
      onSetReference: vi.fn(),
      dataTestIdPrefix: "test-measurement",
    },
  } as const);

const queryEmptyContentLine = (container: HTMLElement) =>
  container.querySelector(
    '[data-test-id="annotation-info-box-empty-content-line"]'
  ) as HTMLDivElement | null;

describe("buildAnnotationInfoBoxSlots", () => {
  it("renders a default empty content line when content is unavailable", () => {
    const slots = buildAnnotationInfoBoxSlots({
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
    const slots = buildAnnotationInfoBoxSlots({
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
    const slots = buildAnnotationInfoBoxSlots({
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

  it("allows host presentations to hide specific action buttons", () => {
    const slots = buildAnnotationInfoBoxSlots({
      ...buildRequiredShellProps(),
      visualOptions: {
        hiddenActionIds: [
          ANNOTATION_INFO_BOX_ACTION_IDS.EXPORT,
          ANNOTATION_INFO_BOX_ACTION_IDS.VISIBILITY,
          ANNOTATION_INFO_BOX_ACTION_IDS.REFERENCE,
          ANNOTATION_INFO_BOX_ACTION_IDS.LOCK,
        ],
      },
    });

    const { container } = render(<>{slots.subtitle}</>);

    expect(
      container.querySelector('[data-test-id="test-measurement-flyto-btn"]')
    ).toBeTruthy();
    expect(
      container.querySelector('[data-test-id="test-measurement-delete-btn"]')
    ).toBeTruthy();
    expect(
      container.querySelector(
        '[data-test-id="test-measurement-export-geojson-btn"]'
      )
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-test-id="test-measurement-toggle-visibility-btn"]'
      )
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-test-id="test-measurement-set-reference-btn"]'
      )
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-test-id="test-measurement-toggle-lock-btn"]'
      )
    ).toBeNull();
  });

  it("allows host presentations to hide subtitle meta text", () => {
    const slots = buildAnnotationInfoBoxSlots({
      ...buildRequiredShellProps(),
      metaText: "12.34 m",
      visualOptions: {
        showSubtitleMetaText: false,
      },
    });

    const { queryByText } = render(<>{slots.subtitle}</>);

    expect(queryByText("12.34 m")).toBeNull();
  });

  it("renders subtitle meta text by default", () => {
    const slots = buildAnnotationInfoBoxSlots({
      ...buildRequiredShellProps(),
      metaText: "12.34 m",
    });

    const { queryByText } = render(<>{slots.subtitle}</>);

    expect(queryByText("12.34 m")).toBeTruthy();
  });
});
