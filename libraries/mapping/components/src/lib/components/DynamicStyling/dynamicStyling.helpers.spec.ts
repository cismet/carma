import { describe, expect, it } from "vitest";
import type { DynamicStylingOptionsConfig } from "@carma-mapping/layers";

import {
  DEFAULT_FILTER_DISABLED_HINT,
  getDynamicStylingFilterDisabledHint,
} from "./dynamicStyling.helpers";

const toggle: DynamicStylingOptionsConfig = {
  type: "toggle",
  label: "Punktwolke",
  default: "visible",
  options: [
    { id: "visible", title: "ausblenden" },
    { id: "none", title: "einblenden" },
  ],
  targets: {},
};

const colors = (
  filterDisabled: unknown
): DynamicStylingOptionsConfig => ({
  type: "list",
  label: "Punktwolke Farbe",
  default: "intensitaet",
  options: [
    { id: "intensitaet", title: "Graustufen", filterDisabled },
    { id: "klassen", title: "Farbig nach Klasse" },
  ],
  targets: {},
});

describe("getDynamicStylingFilterDisabledHint", () => {
  it("disables the filter for the default option that asks for it", () => {
    expect(
      getDynamicStylingFilterDisabledHint([toggle, colors("nur farbig")], {})
    ).toBe("nur farbig");
    expect(
      getDynamicStylingFilterDisabledHint([toggle, colors(true)], undefined)
    ).toBe(DEFAULT_FILTER_DISABLED_HINT);
  });

  it("follows the selection by config index", () => {
    expect(
      getDynamicStylingFilterDisabledHint([toggle, colors(true)], {
        1: "klassen",
      })
    ).toBeNull();
    expect(
      getDynamicStylingFilterDisabledHint([toggle, colors(true)], {
        0: "none",
        1: "intensitaet",
      })
    ).toBe(DEFAULT_FILTER_DISABLED_HINT);
  });

  it("keeps the filter for layers without the flag or styling", () => {
    expect(getDynamicStylingFilterDisabledHint(undefined, {})).toBeNull();
    expect(getDynamicStylingFilterDisabledHint(toggle, {})).toBeNull();
    expect(getDynamicStylingFilterDisabledHint(colors(false), {})).toBeNull();
    expect(getDynamicStylingFilterDisabledHint(colors(" "), {})).toBeNull();
  });
});
