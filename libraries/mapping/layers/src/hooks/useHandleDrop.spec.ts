import { describe, expect, it, vi } from "vitest";

import { resolveDroppedUrl } from "./useHandleDrop";

const createDataTransfer = (values: Record<string, string>) => ({
  getData: vi.fn((type: string) => values[type] ?? ""),
});

describe("resolveDroppedUrl", () => {
  it("reads the browser URL transfer type", () => {
    const dataTransfer = createDataTransfer({
      URL: "https://tiles.cismet.de/alkis/gebaeude-only.style.json",
    });

    expect(resolveDroppedUrl(dataTransfer)).toBe(
      "https://tiles.cismet.de/alkis/gebaeude-only.style.json"
    );
  });

  it("falls back to a URI list and ignores comments", () => {
    const dataTransfer = createDataTransfer({
      "text/uri-list":
        "# dragged link\r\nhttps://tiles.cismet.de/alkis/gebaeude-only.style.json\r\n",
    });

    expect(resolveDroppedUrl(dataTransfer)).toBe(
      "https://tiles.cismet.de/alkis/gebaeude-only.style.json"
    );
  });

  it("falls back to plain text used by app-to-browser dragging", () => {
    const dataTransfer = createDataTransfer({
      "text/plain":
        "  https://tiles.cismet.de/alkis/gebaeude-only.style.json  ",
    });

    expect(resolveDroppedUrl(dataTransfer)).toBe(
      "https://tiles.cismet.de/alkis/gebaeude-only.style.json"
    );
  });

  it("reads an HTML-only dragged link", () => {
    const dataTransfer = createDataTransfer({
      "text/html":
        '<a href="https://tiles.cismet.de/alkis/gebaeude-only.style.json">ALKIS</a>',
    });

    expect(resolveDroppedUrl(dataTransfer)).toBe(
      "https://tiles.cismet.de/alkis/gebaeude-only.style.json"
    );
  });

  it("rejects non-http transfer values", () => {
    const dataTransfer = createDataTransfer({
      "text/plain": "javascript:alert(1)",
    });

    expect(resolveDroppedUrl(dataTransfer)).toBeNull();
  });
});
