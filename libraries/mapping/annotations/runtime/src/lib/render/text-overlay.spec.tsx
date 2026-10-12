import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  TEXT_OVERLAY_AREA_LABEL_STYLE,
  TextOverlay,
  createTextOverlayElement,
  setTextOverlayText,
} from "./text-overlay";

const readVars = (element: HTMLElement) =>
  Object.fromEntries(
    Array.from(
      { length: element.style.length },
      (_, index) => element.style[index]!
    )
      .filter((property) => property.startsWith("--"))
      .map((property) => [property, element.style.getPropertyValue(property)])
  );

describe("text overlay", () => {
  it("applies the style options to the imperative and the React overlay alike", () => {
    const element = createTextOverlayElement({
      styleOptions: TEXT_OVERLAY_AREA_LABEL_STYLE,
    });
    const { container } = render(
      <TextOverlay
        content="12 m²"
        styleOptions={TEXT_OVERLAY_AREA_LABEL_STYLE}
      />
    );

    const reactVars = readVars(container.firstElementChild as HTMLElement);
    expect(readVars(element)).toEqual(reactVars);
    expect(reactVars).toMatchObject({
      "--carma-annotation-text-overlay-font-size": "17px",
      "--carma-annotation-text-overlay-font-weight": "800",
      "--carma-annotation-text-overlay-letter-spacing": "5%",
      "--carma-annotation-text-overlay-text-echo-blur-px": "4px",
    });
  });

  it("falls back to the fontSize prop only without a style-option font size", () => {
    const { container, rerender } = render(
      <TextOverlay content="a" fontSize="12px" />
    );
    const root = () => container.firstElementChild as HTMLElement;
    expect(
      root().style.getPropertyValue("--carma-annotation-text-overlay-font-size")
    ).toBe("12px");

    rerender(
      <TextOverlay
        content="a"
        fontSize="12px"
        styleOptions={{ fontSize: "20px" }}
      />
    );
    expect(
      root().style.getPropertyValue("--carma-annotation-text-overlay-font-size")
    ).toBe("20px");
  });

  it("writes text into the foreground and the echo layer", () => {
    const element = createTextOverlayElement({});
    setTextOverlayText(element, "3.5 m");

    expect(
      element.querySelector('[data-annotation-text-overlay-text="foreground"]')
        ?.textContent
    ).toBe("3.5 m");
    expect(
      element.querySelector('[data-annotation-text-overlay-text-echo="true"]')
        ?.textContent
    ).toBe("3.5 m");
  });
});
