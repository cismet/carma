import { describe, expect, it } from "vitest";
import type { Item, Layer } from "@carma-mapping/layers";

import {
  buildLayerFavoriteItem,
  canFavoriteLayer,
  isFavoriteLayer,
} from "./layer-favorite-utils";

const buildLayer = (overrides: Partial<Layer>): Layer =>
  ({
    id: "layer-1",
    title: "Layer",
    description: "Layer description",
    layerType: "vector",
    type: "layer",
    props: {},
    ...overrides,
  } as Layer);

describe("layer-favorite-utils", () => {
  it("builds favorite items from geoportal layers", () => {
    const layer = buildLayer({
      id: "buga-bridge",
      icon: "layer-icon",
      layerInfo: {
        keywords: ["bridge"],
        thumbnail: "thumbnail.png",
        vectorStyle: "layer-info-style",
      },
      other: {
        serviceName: "custom-service",
        vectorLegend: "legend.png",
      },
      props: {
        legend: "legend-url",
        metaData: "metadata-url",
        style: "props-style",
      } as unknown as Layer["props"],
    });

    const item = buildLayerFavoriteItem(layer) as Item & {
      props?: {
        MetadataURL?: string;
        Style?: Array<{ LegendURL: string }>;
      };
    };

    expect(item).toMatchObject({
      description: "Layer description",
      icon: "layer-icon",
      id: "buga-bridge",
      keywords: ["bridge"],
      serviceName: "custom-service",
      thumbnail: "thumbnail.png",
      title: "Layer",
      type: "layer",
      vectorLegend: "legend.png",
      vectorStyle: "layer-info-style",
    });
    expect(item.props).toEqual({
      MetadataURL: "metadata-url",
      Style: [{ LegendURL: "legend-url" }],
    });
  });

  it("uses the same favorite id matching as the favorite reducer", () => {
    const layer = buildLayer({ id: "layer-1" });
    const favorites = [{ id: "fav_layer-1" } as Item];

    expect(isFavoriteLayer({ favorites, layer })).toBe(true);
  });

  it("allows favorites for non-base operational and object layers", () => {
    expect(
      canFavoriteLayer({
        isBaseLayer: false,
        layer: buildLayer({ type: "object" }),
      })
    ).toBe(true);
    expect(
      canFavoriteLayer({
        isBaseLayer: true,
        layer: buildLayer({ type: "object" }),
      })
    ).toBe(false);
  });
});
