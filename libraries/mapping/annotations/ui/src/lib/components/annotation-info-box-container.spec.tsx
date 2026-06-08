import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const carmaResponsiveInfoBoxMock = vi.hoisted(() =>
  vi.fn(({ heading, subtitle, content }) => (
    <div data-test-id="mock-responsive-info-box">
      {heading}
      {subtitle}
      {content}
    </div>
  ))
);

vi.mock("@carma-commons/ui/components", () => ({
  CarmaResponsiveInfoBox: carmaResponsiveInfoBoxMock,
}));

import { AnnotationInfoBoxContainer } from "./AnnotationInfoBoxContainer";

const slots = {
  headingTitle: "Distanzmessung",
  subtitle: <span>Subtitle</span>,
  content: <span>Content</span>,
};

describe("AnnotationInfoBoxContainer", () => {
  beforeEach(() => {
    carmaResponsiveInfoBoxMock.mockClear();
  });

  it("keeps collapsed boxes anchored to the control edge by default", () => {
    render(<AnnotationInfoBoxContainer slots={slots} />);

    expect(carmaResponsiveInfoBoxMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        controlPosition: "bottomright",
        collapsedHorizontalAnchor: "control-edge",
      })
    );
  });

  it("allows overriding the collapsed horizontal anchor", () => {
    render(
      <AnnotationInfoBoxContainer
        slots={slots}
        collapsedHorizontalAnchor="expanded-left"
      />
    );

    expect(carmaResponsiveInfoBoxMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        collapsedHorizontalAnchor: "expanded-left",
      })
    );
  });

  it("renders headerless slots without a heading node", () => {
    render(
      <AnnotationInfoBoxContainer
        slots={{
          content: <span>Content</span>,
          collapsible: false,
        }}
      />
    );

    expect(carmaResponsiveInfoBoxMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        heading: undefined,
      })
    );
  });

  it("passes visual header styles to the responsive card shell", () => {
    const headerStyle = {
      backgroundImage: "linear-gradient(red, blue)",
    };

    render(
      <AnnotationInfoBoxContainer
        slots={slots}
        visualOptions={{
          headerStyle,
        }}
      />
    );

    expect(carmaResponsiveInfoBoxMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        headingStyle: headerStyle,
      })
    );
  });
});
