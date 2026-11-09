import { describe, expect, it } from "vitest";

import {
  buildSymbolBadgeSvgMarkup,
  SYMBOL_BADGE_DEFAULT_DIMENSION,
} from "./symbolBadgeMarkup";

const SIGNATURE = `<svg viewBox="0 0 24 24" width="24" height="24"><rect class="bg-fill" fill="#e2923b" width="24" height="24"/></svg>`;

describe("buildSymbolBadgeSvgMarkup", () => {
  it("reproduces the geometry of the Leaflet deployment", () => {
    // 40.5px is the large sample of react-cismap's SymbolSizeChooser
    // (45 * 0.9). Against a 24x24 signature the live markup reads
    // x="0.84375" width="38.8125", and a migrated app has to match that or the
    // marker changes size on migration.
    const markup = buildSymbolBadgeSvgMarkup({
      svgMarkup: SIGNATURE,
      id: "badge",
      dimension: { width: 24, height: 24 },
      sizePx: 40.5,
      color: "#e2923b",
    });

    expect(markup).toContain('x="0.84375"');
    expect(markup).toContain('y="0.84375"');
    expect(markup).toContain('width="38.8125"');
    expect(markup).toContain('height="38.8125"');
    expect(markup).toContain('viewBox="0 0 24 24"');
  });

  it("paints the background parts in the requested colour", () => {
    const markup = buildSymbolBadgeSvgMarkup({
      svgMarkup: SIGNATURE,
      id: "badge",
      color: "#58b146",
    });

    expect(markup).toContain("#badge .bg-fill { fill: #58b146; }");
    expect(markup).toContain("#badge .bg-stroke { stroke: #58b146; }");
    expect(markup).toContain("#badge .fg-fill { fill: white; }");
  });

  it("allows overriding the foreground colour", () => {
    const markup = buildSymbolBadgeSvgMarkup({
      svgMarkup: SIGNATURE,
      id: "badge",
      color: "#000000",
      foregroundColor: "#ffee00",
    });

    expect(markup).toContain("#badge .fg-fill { fill: #ffee00; }");
  });

  it("scopes every rule to the given id so two badges cannot bleed into each other", () => {
    const first = buildSymbolBadgeSvgMarkup({
      svgMarkup: SIGNATURE,
      id: "one",
      color: "#111111",
    });
    const second = buildSymbolBadgeSvgMarkup({
      svgMarkup: SIGNATURE,
      id: "two",
      color: "#222222",
    });

    expect(first).toContain('<svg id="one"');
    expect(first).not.toContain("#two");
    expect(second).toContain('<svg id="two"');
    expect(second).not.toContain("#one");
  });

  it("inlines the signature verbatim", () => {
    const markup = buildSymbolBadgeSvgMarkup({
      svgMarkup: SIGNATURE,
      id: "badge",
      color: "#000000",
    });

    expect(markup).toContain(SIGNATURE);
  });

  it("falls back to the default dimension for unusable values", () => {
    // Dimensions are read off SVG attributes and can be absent, zero or
    // non-numeric. Dividing by those would emit Infinity or NaN into the markup.
    const cases = [
      undefined,
      { width: 0, height: 0 },
      { width: "auto", height: "auto" },
    ];

    for (const dimension of cases) {
      const markup = buildSymbolBadgeSvgMarkup({
        svgMarkup: SIGNATURE,
        id: "badge",
        dimension: dimension as never,
        sizePx: 24,
        color: "#000000",
      });

      expect(markup).not.toMatch(/NaN|Infinity/);
      expect(markup).toContain(
        `viewBox="0 0 ${SYMBOL_BADGE_DEFAULT_DIMENSION.width} ${SYMBOL_BADGE_DEFAULT_DIMENSION.height}"`
      );
    }
  });

  it("reads dimensions given as attribute strings", () => {
    const markup = buildSymbolBadgeSvgMarkup({
      svgMarkup: SIGNATURE,
      id: "badge",
      dimension: { width: "312", height: "312" },
      sizePx: 24,
      color: "#000000",
    });

    expect(markup).toContain('viewBox="0 0 312 312"');
  });
});
