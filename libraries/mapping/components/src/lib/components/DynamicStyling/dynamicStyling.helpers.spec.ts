import { describe, expect, it } from "vitest";
import type { DynamicStylingOptionsConfig } from "@carma-mapping/layers";

import {
  DEFAULT_CONTROL_DISABLED_HINT,
  DEFAULT_FILTER_DISABLED_HINT,
  getDynamicStylingControlDisabledHint,
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

describe("getDynamicStylingControlDisabledHint", () => {
  const direction = (hint?: string): DynamicStylingOptionsConfig => ({
    type: "toggle",
    label: "Fahrt",
    default: "hin",
    options: [
      { id: "hin", title: "Hinfahrt" },
      { id: "rueck", title: "Rueckfahrt" },
    ],
    targets: {},
    disabledWhen: { label: "Punktwolke", ids: ["none"], hint },
  });

  it("disables while the referenced config has a listed option", () => {
    const configs = [toggle, direction("aus")];
    expect(
      getDynamicStylingControlDisabledHint(configs, { 0: "none" }, configs[1])
    ).toBe("aus");
    expect(
      getDynamicStylingControlDisabledHint(configs, {}, configs[1])
    ).toBeNull();
  });

  it("falls back to the default hint and ignores unknown labels", () => {
    const configs = [toggle, direction()];
    expect(
      getDynamicStylingControlDisabledHint(configs, { 0: "none" }, configs[1])
    ).toBe(DEFAULT_CONTROL_DISABLED_HINT);
    expect(
      getDynamicStylingControlDisabledHint([direction()], {}, direction())
    ).toBeNull();
    expect(getDynamicStylingControlDisabledHint(configs, {}, toggle)).toBeNull();
  });
});
