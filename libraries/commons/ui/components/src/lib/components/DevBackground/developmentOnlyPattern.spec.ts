import { describe, expect, it } from "vitest";

import {
  buildDevelopmentOnlyPatternSvgMarkup,
  DEVELOPMENT_ONLY_UI_BACKDROP_PATTERN_TEXT,
  readDevelopmentOnlyUiBackdropStyle,
} from "./developmentOnlyPattern";

describe("readDevelopmentOnlyUiBackdropStyle", () => {
  it("uses a development-only UI backdrop pattern by default", () => {
    const style = readDevelopmentOnlyUiBackdropStyle();

    expect(style.backgroundImage).toContain(
      encodeURIComponent(DEVELOPMENT_ONLY_UI_BACKDROP_PATTERN_TEXT)
    );
    expect(style.backgroundImage).toContain(
      encodeURIComponent('fill="rgba(15, 23, 42, 0.13)"')
    );
    expect(style.backgroundColor).toBe("rgba(255, 255, 255, 0.82)");
    expect(style.backgroundRepeat).toBe("repeat");
    expect(style.backgroundSize).toBe("720px 144px");
  });

  it("allows explicit pattern text overrides", () => {
    const style = readDevelopmentOnlyUiBackdropStyle({
      text: "Custom placeholder",
    });

    expect(style.backgroundImage).toContain(
      encodeURIComponent("Custom placeholder")
    );
    expect(style.backgroundImage).not.toContain(
      encodeURIComponent(DEVELOPMENT_ONLY_UI_BACKDROP_PATTERN_TEXT)
    );
  });

  it("uses a repeating CSS gradient for textless stripe patterns", () => {
    const style = readDevelopmentOnlyUiBackdropStyle({
      backgroundColor: "transparent",
      primaryColor: "rgba(0, 0, 0, 0.24)",
      rotationDeg: 45,
      secondaryColor: "rgba(249, 168, 0, 0.25)",
      stripeWidthPx: 12,
      text: "Hidden preview text",
      textVisible: false,
    });

    expect(style.backgroundImage).toBe(
      "repeating-linear-gradient(45deg, rgba(0, 0, 0, 0.24) 0 12px, rgba(249, 168, 0, 0.25) 12px 24px)"
    );
    expect(style.backgroundColor).toBe("transparent");
    expect(style.backgroundSize).toBe("auto");
    expect(style.backgroundImage).not.toContain("Hidden preview text");
    expect(style.backgroundImage).not.toContain("data:image");
  });

  it("allows thin line patterns with an explicit transparent gap", () => {
    const style = readDevelopmentOnlyUiBackdropStyle({
      primaryColor: "rgba(75, 85, 99, 0.22)",
      secondaryColor: "transparent",
      stripeGapPx: 9,
      stripeWidthPx: 1,
      textVisible: false,
    });

    expect(style.backgroundImage).toBe(
      "repeating-linear-gradient(45deg, rgba(75, 85, 99, 0.22) 0 1px, transparent 1px 10px)"
    );
  });

  it("builds the preview backdrop from tileable diagonal geometry", () => {
    const markup = buildDevelopmentOnlyPatternSvgMarkup({
      primaryColor: "rgba(15, 23, 42, 0.13)",
      stripeWidthPx: 18,
      text: DEVELOPMENT_ONLY_UI_BACKDROP_PATTERN_TEXT,
      textPunchOut: false,
      tileHeightPx: 144,
      tileWidthPx: 720,
    });

    expect(markup).toContain("<polygon");
    expect(markup).toContain('width="720" height="144"');
    expect(markup).toContain(DEVELOPMENT_ONLY_UI_BACKDROP_PATTERN_TEXT);
    expect(markup).not.toContain("patternTransform");
  });

  it("keeps alternating negative text on primary stripes", () => {
    const markup = buildDevelopmentOnlyPatternSvgMarkup({
      primaryColor: "rgba(15, 23, 42, 0.13)",
      text: DEVELOPMENT_ONLY_UI_BACKDROP_PATTERN_TEXT,
      tileHeightPx: 144,
      tileWidthPx: 720,
    });

    expect(markup).toContain('mask="url(#development-only-punched-text)"');
    expect(markup).toContain('fill="#000000"');
    expect(markup).toContain('fill="rgba(15, 23, 42, 0.13)"');
  });
});
