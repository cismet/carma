import { describe, expect, it } from "vitest";

import {
  ANNOTATION_COMPONENT_DISPLAY_MODES,
  ANNOTATION_LINE_STYLE_DEFAULTS,
  resolveAnnotationLineStyleOptions,
  showsAnnotationComponents,
} from "./annotation-line-style-options";

describe("annotation line style options", () => {
  it("shows the components of every line by default", () => {
    expect(ANNOTATION_LINE_STYLE_DEFAULTS.components).toBe(
      ANNOTATION_COMPONENT_DISPLAY_MODES.ALWAYS
    );
    expect(resolveAnnotationLineStyleOptions().components).toBe("always");
    expect(resolveAnnotationLineStyleOptions({}).components).toBe("always");
  });

  it("takes a valid components mode and falls back on anything else", () => {
    expect(
      resolveAnnotationLineStyleOptions({ components: "selected" }).components
    ).toBe("selected");
    expect(
      resolveAnnotationLineStyleOptions({
        components: "off" as unknown as "always",
      }).components
    ).toBe("always");
  });

  it("falls back on the given defaults", () => {
    const defaults = {
      ...ANNOTATION_LINE_STYLE_DEFAULTS,
      components: ANNOTATION_COMPONENT_DISPLAY_MODES.SELECTED,
    };

    expect(
      resolveAnnotationLineStyleOptions(undefined, defaults).components
    ).toBe("selected");
    expect(
      resolveAnnotationLineStyleOptions({ components: "always" }, defaults)
        .components
    ).toBe("always");
  });

  it("shows the components of a committed line by mode and selection", () => {
    expect(showsAnnotationComponents("always", false)).toBe(true);
    expect(showsAnnotationComponents("always", true)).toBe(true);
    expect(showsAnnotationComponents("selected", false)).toBe(false);
    expect(showsAnnotationComponents("selected", true)).toBe(true);
  });
});
