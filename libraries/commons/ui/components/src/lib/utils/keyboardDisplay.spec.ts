import { describe, expect, it } from "vitest";

import {
  resolveBackspaceDisplayLabel,
  resolveKeyboardDisplayLabels,
  resolveKeyboardDisplayPlatform,
} from "./keyboardDisplay";

describe("keyboardDisplay", () => {
  it("resolves keyboard labels by locale language", () => {
    expect(resolveKeyboardDisplayLabels("de-DE").backspace).toBe("Rücktaste");
    expect(resolveKeyboardDisplayLabels("en-US").shift).toBe("Shift");
    expect(resolveKeyboardDisplayLabels("fr-FR").backspace).toBe("Backspace");
  });

  it("keeps explicit platform overrides", () => {
    expect(resolveKeyboardDisplayPlatform("macos")).toBe("macos");
    expect(resolveKeyboardDisplayPlatform("windows")).toBe("windows");
    expect(resolveKeyboardDisplayPlatform("other")).toBe("other");
  });

  it("formats backspace labels by platform", () => {
    expect(
      resolveBackspaceDisplayLabel(
        "windows",
        resolveKeyboardDisplayLabels("de-DE")
      )
    ).toBe("← Rücktaste");
    expect(
      resolveBackspaceDisplayLabel(
        "macos",
        resolveKeyboardDisplayLabels("de-DE")
      )
    ).toBe("⌫");
  });
});
