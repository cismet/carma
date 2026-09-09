import { describe, expect, it } from "vitest";
import {
  buildVectorStyleItem,
  parseVectorStyle,
  styleUrlTitle,
  substituteServerUrl,
} from "./vectorStyleItem";

describe("substituteServerUrl", () => {
  it("replaces both placeholder spellings", () => {
    expect(
      substituteServerUrl(
        "__SERVER_URL__/a.pbf and __server_url__/b.pbf",
        "https://tiles.example.de"
      )
    ).toBe("https://tiles.example.de/a.pbf and https://tiles.example.de/b.pbf");
  });

  it("substitutes while parsing", () => {
    const style = parseVectorStyle(
      '{"sources":{"s":{"url":"__SERVER_URL__/s.json"}}}',
      "https://tiles.example.de"
    ) as { sources: { s: { url: string } } };
    expect(style.sources.s.url).toBe("https://tiles.example.de/s.json");
  });
});

describe("styleUrlTitle", () => {
  it("strips the json extension", () => {
    expect(styleUrlTitle("https://tiles.example.de/boden/style.json")).toBe(
      "https://tiles.example.de/boden/style"
    );
  });
});

describe("buildVectorStyleItem", () => {
  const base = {
    styleRef: "https://tiles.example.de/boden/style.json",
    id: "custom:boden",
    fallbackTitle: "boden",
  };

  it("points the item at the style and files it under the custom category", () => {
    const { item, instant } = buildVectorStyleItem({ ...base, style: null });
    expect(item).toMatchObject({
      id: "custom:boden",
      title: "boden",
      layerType: "vector",
      serviceName: "custom",
      type: "layer",
      path: "Externe Dienste",
      keywords: [
        "carmaConf://vectorStyle:https://tiles.example.de/boden/style.json",
      ],
    });
    expect(instant).toBe(false);
  });

  it("takes the display data from the style's layerInfo", () => {
    const { item, instant } = buildVectorStyleItem({
      ...base,
      style: {
        metadata: {
          carmaConf: {
            instant: true,
            layerInfo: {
              title: "Bodenrichtwerte",
              description: "Richtwertzonen",
              thumbnail: "https://tiles.example.de/boden/thumb.png",
              mapMode: "2d",
              keywords: ["carmaConf://minZoom:12"],
            },
          },
        },
      },
    });
    expect(item).toMatchObject({
      title: "Bodenrichtwerte",
      description: "Richtwertzonen",
      thumbnail: "https://tiles.example.de/boden/thumb.png",
      mapMode: "2d",
    });
    // the style keyword survives the merge, the layerInfo keywords join it
    expect(item.keywords).toEqual([
      "carmaConf://vectorStyle:https://tiles.example.de/boden/style.json",
      "carmaConf://minZoom:12",
    ]);
    expect(instant).toBe(true);
  });

  it("keeps the fallbacks for a style with metadata but no carmaConf", () => {
    const { item, instant } = buildVectorStyleItem({
      ...base,
      style: { metadata: {} },
    });
    expect(item.title).toBe("boden");
    expect(instant).toBe(false);
  });

  it("builds a twin item as an object", () => {
    const { item } = buildVectorStyleItem({
      ...base,
      style: null,
      type: "object",
    });
    expect(item.type).toBe("object");
  });
});
