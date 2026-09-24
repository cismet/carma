import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

import type {
  ActiveLayers,
  Item,
  Layer,
} from "../lib/contracts/carma-layers.d";
import { useSyncActiveLayers } from "./useSyncActiveLayers";

const parseToMapLayer = vi.hoisted(() => vi.fn());
vi.mock("@carma-mapping/utils", () => ({ parseToMapLayer }));

const STYLE_URL = "https://tiles.cismet.de/kwp_waermenetz/style.json";

const item = {
  id: "wuppPlanung:kwp_waermenetz",
  title: "Eignung Wärmenetz",
  type: "layer",
  vectorStyle: STYLE_URL,
} as unknown as Item;

const layerWith = (mapping: string, overrides: Partial<Layer> = {}): Layer =>
  ({
    id: item.id,
    title: item.title,
    layerType: "vector",
    type: "layer",
    visible: true,
    opacity: 1,
    conf: { infoBoxMapping: mapping },
    props: { style: STYLE_URL },
    ...overrides,
  }) as unknown as Layer;

const FRESH = layerWith("fresh");
const STALE = layerWith("stale");

type Props = { activeLayers: Layer[]; catalogItems: Map<string, Item> };

const renderSync = (initial: Props) => {
  const updateActiveLayer = vi.fn();
  const hook = renderHook(
    ({ activeLayers, catalogItems }: Props) =>
      useSyncActiveLayers({
        // the sync treats the background entry like any other layer
        activeLayers: activeLayers as unknown as ActiveLayers,
        catalogItems,
        updateActiveLayer,
        enabled: true,
        vectorTileServerUrl: "https://tiles.cismet.de",
      }),
    { initialProps: initial }
  );
  return { ...hook, updateActiveLayer };
};

describe("useSyncActiveLayers", () => {
  beforeEach(() => {
    parseToMapLayer.mockReset();
    parseToMapLayer.mockImplementation(
      async (_item: Item, _forceWMS: boolean, visible: boolean, opacity = 1) =>
        ({ ...FRESH, visible, opacity }) as Layer
    );
  });

  it("rebuilds an old copy that replaces the layer under the same id", async () => {
    const catalogItems = new Map([[item.id, item]]);
    const { rerender, updateActiveLayer } = renderSync({
      activeLayers: [FRESH],
      catalogItems,
    });
    await waitFor(() => expect(parseToMapLayer).toHaveBeenCalledTimes(1));
    expect(updateActiveLayer).not.toHaveBeenCalled();

    // a saved collection is applied: same id, same catalog item, old definition
    rerender({ activeLayers: [STALE], catalogItems });

    await waitFor(() => expect(updateActiveLayer).toHaveBeenCalledTimes(1));
    expect(updateActiveLayer.mock.calls[0][0].conf).toEqual({
      infoBoxMapping: "fresh",
    });
  });

  it("does not rebuild again once its own update is on the map", async () => {
    const catalogItems = new Map([[item.id, item]]);
    const { rerender, updateActiveLayer } = renderSync({
      activeLayers: [STALE],
      catalogItems,
    });
    await waitFor(() => expect(updateActiveLayer).toHaveBeenCalledTimes(1));

    rerender({ activeLayers: [FRESH], catalogItems });
    // a runtime change is no new definition either
    rerender({ activeLayers: [{ ...FRESH, opacity: 0.5 }], catalogItems });

    expect(parseToMapLayer).toHaveBeenCalledTimes(1);
    expect(updateActiveLayer).toHaveBeenCalledTimes(1);
  });

  it("refreshes an old copy of a layer the catalog does not carry", async () => {
    const catalogItems = new Map<string, Item>();
    const { rerender, updateActiveLayer } = renderSync({
      activeLayers: [FRESH],
      catalogItems,
    });
    await waitFor(() => expect(parseToMapLayer).toHaveBeenCalledTimes(1));

    rerender({ activeLayers: [STALE], catalogItems });

    await waitFor(() => expect(updateActiveLayer).toHaveBeenCalledTimes(1));
    expect(parseToMapLayer).toHaveBeenCalledTimes(2);
    expect(updateActiveLayer.mock.calls[0][0].conf).toEqual({
      infoBoxMapping: "fresh",
    });
  });

  it("rebuilds a dropped style from the style, not from its frozen keywords", async () => {
    const freshMapping = "carmaconf://infoBoxMapping:fresh";
    const fetchMock = vi.fn(async () => ({
      text: async () =>
        JSON.stringify({
          metadata: {
            carmaConf: {
              layerInfo: { title: "Neuer Titel", keywords: [freshMapping] },
            },
          },
        }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const dropped = layerWith("stale", {
      id: `custom:${STYLE_URL}`,
      other: {
        serviceName: "custom",
        keywords: [
          `carmaConf://vectorStyle:${STYLE_URL}`,
          "carmaconf://infoBoxMapping:stale",
        ],
      },
    } as Partial<Layer>);

    renderSync({ activeLayers: [dropped], catalogItems: new Map() });

    await waitFor(() => expect(parseToMapLayer).toHaveBeenCalledTimes(1));
    const rebuiltItem = parseToMapLayer.mock.calls[0][0] as Item;
    expect(fetchMock).toHaveBeenCalledWith(STYLE_URL);
    expect(rebuiltItem.id).toBe(`custom:${STYLE_URL}`);
    expect(rebuiltItem.title).toBe("Neuer Titel");
    expect(rebuiltItem.keywords).toEqual([
      `carmaConf://vectorStyle:${STYLE_URL}`,
      freshMapping,
    ]);

    vi.unstubAllGlobals();
  });
});
