// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import type { ViewState } from "@carma-mapping/engines-interop/view-state";
import { ObjectCentricViewStateInfoBox } from "./ObjectCentricViewStateInfoBox";

const visualizerSpy = vi.fn();

vi.mock("@carma-commons/ui/components", () => ({
  FROSTED_GLASS_BLUR_PRESET: {
    MID: "mid",
  },
  readFrostedGlassBackdropStyle: () => ({}),
  CarmaResponsiveInfoBox: ({ content }: { content: ReactNode }) => (
    <div>{content}</div>
  ),
}));

vi.mock("@ant-design/icons", () => ({
  InfoCircleOutlined: () => <span data-testid="info-icon" />,
}));

vi.mock("antd", () => ({
  Button: ({ children }: { children?: ReactNode }) => (
    <button type="button">{children}</button>
  ),
  Popover: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Tooltip: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

vi.mock("./ViewStateVisualizer", () => ({
  ViewStateVisualizer: (props: Record<string, unknown>) => {
    visualizerSpy(props);
    return <div data-testid="view-state-visualizer" />;
  },
}));

describe("ObjectCentricViewStateInfoBox", () => {
  beforeEach(() => {
    visualizerSpy.mockClear();
  });

  it("renders the visualizer with a stable configured size to the left of the table", async () => {
    render(
      <ObjectCentricViewStateInfoBox
        rows={[{ label: "zoom equiv.", value: "18.0" }]}
        viewState={{} as ViewState}
        visualizerWidth={176}
        visualizerHeight={176}
      />
    );

    await waitFor(() => {
      expect(visualizerSpy).toHaveBeenCalled();
    });

    expect(visualizerSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        width: 176,
        height: 176,
      })
    );

    const visualizer = screen.getByTestId("view-state-visualizer");
    const valueCell = screen.getByText("18.0");
    const table = document.querySelector("table");
    const tableContainer = table?.parentElement;
    expect(
      visualizer.compareDocumentPosition(valueCell) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(table).not.toBeNull();
    expect(table?.style.width).toBe("auto");
    expect(tableContainer?.style.paddingRight).toBe("4px");
  });

  it("renders the details link bottom-right without placing it inside the table column", async () => {
    render(
      <ObjectCentricViewStateInfoBox
        rows={[{ label: "zoom equiv.", value: "18.0" }]}
        viewState={{} as ViewState}
        detailsTitle="View JSON"
        detailsContent={<div>details</div>}
      />
    );

    await waitFor(() => {
      expect(visualizerSpy).toHaveBeenCalled();
    });

    const table = document.querySelector("table");
    const tableContainer = table?.parentElement;
    const detailsButton = screen.getByRole("button", { name: "View JSON" });
    const detailsOverlay = screen.getByTestId("object-centric-info-details");

    expect(tableContainer).not.toBeNull();
    expect(tableContainer?.contains(detailsButton)).toBe(false);
    expect(detailsOverlay.contains(detailsButton)).toBe(true);
    expect(detailsOverlay.style.justifyContent).toBe("flex-end");
    expect(detailsOverlay.style.alignItems).toBe("flex-end");
  });
});
