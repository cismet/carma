import { describe, expect, it } from "vitest";

import {
  fachzwillingBranding,
  recolorLogo,
} from "@carma-collab/wuppertal/fachzwilling";

const logo = `<circle fill="#AD2F7D"/><path fill="#57183f" stroke="#ffffff"/><path stroke="#ad2f7d"/>`;

describe("recolorLogo", () => {
  it("swaps the accent and its half-brightness shade, keeping white", () => {
    expect(recolorLogo(logo, "#1f5591")).toBe(
      `<circle fill="#1f5591"/><path fill="#102b49" stroke="#ffffff"/><path stroke="#1f5591"/>`
    );
  });

  it("leaves a logo that is not white plus two colors unchanged", () => {
    const threeColors = `${logo}<path fill="#123456"/>`;
    expect(recolorLogo(threeColors, "#1f5591")).toBe(threeColors);
  });

  it("leaves the logo unchanged for an accent that is not #rrggbb", () => {
    expect(recolorLogo(logo, "red")).toBe(logo);
  });

  it.each(Object.entries(fachzwillingBranding))(
    "recolors every color of the %s logo",
    (_name, { logoSvg }) => {
      const colors = recolorLogo(logoSvg, "#008000")
        .match(/#[0-9a-f]{6}\b/gi)
        ?.map((color) => color.toLowerCase());
      expect(new Set(colors)).toEqual(
        new Set(["#008000", "#004000", "#ffffff"])
      );
    }
  );
});
