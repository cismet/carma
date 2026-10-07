import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import QualitySettingsComparison from "./QualitySettingsComparison";

describe("QualitySettingsComparison", () => {
  it("renders a bounded loading state without image or canvas work during SSR", () => {
    const html = renderToStaticMarkup(
      <QualitySettingsComparison manifestUrl="/blind-l3-l4/quality-exploration.json" />
    );
    expect(html).toContain('role="status"');
    expect(html).toContain("Vergleich wird geladen");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<canvas");
  });
});
