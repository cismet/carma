import { describe, expect, it, vi } from "vitest";

import {
  parseWmsLayerUrl,
  replaceVectorTileServerPlaceholders,
  resolveDroppedUrl,
} from "./resolve-dropped-url";

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

describe("replaceVectorTileServerPlaceholders", () => {
  it("replaces both supported placeholder spellings", () => {
    expect(
      replaceVectorTileServerPlaceholders(
        '{"upper":"__SERVER_URL__","lower":"__server_url__"}',
        "https://tiles.example.test"
      )
    ).toBe(
      '{"upper":"https://tiles.example.test","lower":"https://tiles.example.test"}'
    );
  });
});

describe("parseWmsLayerUrl", () => {
  it("derives the capabilities url and layer from a GetMap link", () => {
    expect(
      parseWmsLayerUrl(
        "https://maps.wuppertal.de/umwelt?service=WMS&request=GetMap&layers=solar_year"
      )
    ).toEqual({
      capabilitiesUrl:
        "https://maps.wuppertal.de/umwelt?service=WMS&request=GetCapabilities",
      layerNames: ["solar_year"],
    });
  });

  it("handles uppercase params, multiple layers and keeps vendor params", () => {
    expect(
      parseWmsLayerUrl(
        "https://example.com/wms?map=/x.map&SERVICE=WMS&REQUEST=GetMap&LAYERS=a,b&BBOX=1,2,3,4&WIDTH=256"
      )
    ).toEqual({
      capabilitiesUrl:
        "https://example.com/wms?map=%2Fx.map&service=WMS&request=GetCapabilities",
      layerNames: ["a", "b"],
    });
  });

  it("ignores capabilities urls and non-wms urls", () => {
    expect(
      parseWmsLayerUrl(
        "https://maps.wuppertal.de/umwelt?service=WMS&request=GetCapabilities"
      )
    ).toBeNull();
    expect(parseWmsLayerUrl("https://example.com/?layers=a")).toBeNull();
    expect(
      parseWmsLayerUrl("https://maps.wuppertal.de/umwelt?service=WMS")
    ).toBeNull();
  });
});
