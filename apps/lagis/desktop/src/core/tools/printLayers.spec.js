import { describe, expect, it, vi } from "vitest";

// Reached transitively via libreFeatures -> mappingTools; the bundle does not
// load under jsdom and nothing here needs it.
vi.mock("maplibre-gl", () => ({ default: {} }));

import { buildLagisPrintLayers, findIntranetLayers } from "./printLayers";

const wmtsLayer = {
  type: "wmts",
  carmaLayerId: "lbk.0",
  url: "https://geodaten.metropoleruhr.de/spw2/service",
  layers: "spw2_light_grundriss",
  opacity: 0.7,
};

const intranetLayer = {
  type: "wmts",
  carmaLayerId: "liegenschaftskarteGrau",
  url: "https://sl0548-wuppertal-intra.map-hosting.de/forwardingTo/s10221/7098/alkis/services",
  layers: "alkomgw",
  opacity: 1,
};

const vectorLayer = {
  type: "vector",
  name: "stadtplan",
  carmaLayerId: "stadtplan",
  style: "https://omt.map-hosting.de/styles/osm-bright-grey/style.json",
  opacity: 1,
};

const featureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      id: 0,
      geometry: { type: "Point", coordinates: [7.2, 51.27] },
      properties: { __fillColor: "#26ADE4", __strokeColor: "#005F6B" },
    },
  ],
};

describe("buildLagisPrintLayers", () => {
  it("maps wms/wmts layers onto the print input shape", () => {
    const [layer] = buildLagisPrintLayers([wmtsLayer], undefined);

    expect(layer).toEqual({
      visible: true,
      layerType: "wmts",
      url: wmtsLayer.url,
      layers: "spw2_light_grundriss",
      opacity: 0.7,
    });
  });

  it("finds the intranet layers, which the print servers cannot reach", () => {
    expect(findIntranetLayers([wmtsLayer, intranetLayer, vectorLayer])).toEqual(
      [intranetLayer]
    );
  });

  it("prints vector layers with their live style from the map", () => {
    const source = { type: "vector", url: "https://example.com/tiles.json" };
    const map = {
      getStyle: () => ({
        sprite: "https://example.com/sprite",
        glyphs: "https://example.com/{fontstack}/{range}.pbf",
        sources: { "stadtplan::src": source, "other::src": {} },
        layers: [
          {
            id: "stadtplan::roads",
            type: "line",
            source: "stadtplan::src",
            paint: { "line-opacity": 0.5 },
            metadata: { "carma-layer-id": "stadtplan" },
          },
          {
            id: "other::fill",
            type: "fill",
            source: "other::src",
            metadata: { "carma-layer-id": "other" },
          },
        ],
      }),
    };

    const [layer] = buildLagisPrintLayers([vectorLayer], undefined, map);

    expect(layer.layerType).toBe("inline");
    expect(layer.opacity).toBe(1);
    expect(layer.inlineStyle.sources).toEqual({ "stadtplan::src": source });
    expect(layer.inlineStyle.layers.map((l) => l.id)).toEqual([
      "stadtplan::roads",
    ]);
    expect(layer.inlineStyle.sprite).toBe("https://example.com/sprite");
  });

  it("maps hosted vector styles, which the core keys its print style from", () => {
    const [layer] = buildLagisPrintLayers([vectorLayer], undefined);

    expect(layer).toMatchObject({
      visible: true,
      layerType: "vector",
      style: vectorLayer.style,
      props: { style: vectorLayer.style },
    });
  });

  it("drops layers without a MapFish equivalent", () => {
    const layers = buildLagisPrintLayers(
      [
        { type: "geojson", data: {} },
        // a local StyleSpecification cannot be resolved to a hosted style
        { type: "vector", style: { version: 8, layers: [] } },
        { type: "wms", url: "https://example.com/ows" },
      ],
      undefined
    );

    expect(layers).toEqual([]);
  });

  it("appends the feature collection as an inline style on top", () => {
    const layers = buildLagisPrintLayers(
      [vectorLayer, wmtsLayer],
      featureCollection
    );

    expect(layers).toHaveLength(3);

    const inline = layers[layers.length - 1];
    expect(inline.layerType).toBe("inline");
    expect(inline.opacity).toBe(1);

    // self contained: the geometry travels with the style
    const style = inline.inlineStyle;
    const [sourceId, source] = Object.entries(style.sources)[0];
    expect(source.data).toBe(featureCollection);
    expect(style.layers.map((l) => l.type)).toEqual(["fill", "line", "circle"]);
    style.layers.forEach((l) => expect(l.source).toBe(sourceId));
    expect(style.layers[0].paint["fill-color"]).toEqual(["get", "__fillColor"]);
  });

  it("prints nothing extra when the foreground is toggled off", () => {
    const layers = buildLagisPrintLayers([vectorLayer], {
      type: "FeatureCollection",
      features: [],
    });

    expect(layers).toHaveLength(1);
    expect(layers[0].layerType).toBe("vector");
  });

  it("prints only the foreground when the background is toggled off", () => {
    const layers = buildLagisPrintLayers([], featureCollection);

    expect(layers).toHaveLength(1);
    expect(layers[0].layerType).toBe("inline");
  });
});
