/* eslint-disable @typescript-eslint/no-explicit-any */
import { createElement, type ReactNode } from "react";
import {
  configure,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";

import capabilitiesKartenXml from "../test/fixtures/capabilities-karten.xml?raw";
import additionalLayerConfig from "../test/fixtures/additionalLayerConfig.json";
import additionalSensorConfig from "../test/fixtures/additionalSensorConfig.json";
import additionalObjectConfig from "../test/fixtures/additionalObjectConfig.json";
import discoverItems from "../test/fixtures/discoverItems.json";

vi.mock("@carma-mapping/components", () => ({
  useMapFrameworkSwitcherContext: () => ({
    isCesium: false,
    requestTransitionToCesium: vi.fn(),
    requestTransitionToLeaflet: vi.fn(),
  }),
  LayerButton: ({ children }: { children?: ReactNode }) =>
    createElement("div", null, children),
  LayerIcon: () => null,
}));

vi.mock("@carma-providers/auth", () => ({
  useAuth: () => ({
    jwt: undefined,
    userGroups: [],
    setJWT: vi.fn(),
  }),
}));

import localForage from "localforage";

import { LayerCatalog, type ActiveLayers } from "./LayerCatalog";
import { LayerCatalogProvider } from "../context/LayerCatalogProvider";
import { wuppLayerCatalogConfig } from "../config/layerCatalogConfig";

const textResponse = (body: string, status = 200) =>
  Promise.resolve({
    ok: status < 400,
    status,
    text: async () => body,
    json: async () => JSON.parse(body),
  } as Response);

const jsonResponse = (data: unknown) => textResponse(JSON.stringify(data));

const routedFetch = (input: RequestInfo | URL): Promise<Response> => {
  const url = String(input);

  if (url.includes("additionalLayerConfig.json")) {
    return jsonResponse(additionalLayerConfig);
  }
  if (url.includes("additionalSensorConfig.json")) {
    return jsonResponse(additionalSensorConfig);
  }
  if (url.includes("additionalObjectConfig.json")) {
    return jsonResponse(additionalObjectConfig);
  }
  if (url.includes("systemMessages.json.md5")) {
    return textResponse("system-messages-md5");
  }
  if (url.includes("systemMessages.json")) {
    return jsonResponse({});
  }
  if (
    url.includes("maps.wuppertal.de/karten") &&
    url.includes("GetCapabilities")
  ) {
    return textResponse(capabilitiesKartenXml);
  }
  if (url.includes("maps.wuppertal.de")) {
    // the other WMS services stay empty in the tests
    return textResponse("", 204);
  }
  if (url.includes("dataAquisition")) {
    // force the fallback to the public discover JSON
    return textResponse("server error", 500);
  }
  if (url.includes("gp_entdecken.json.md5")) {
    return textResponse("gp-entdecken-md5");
  }
  if (url.includes("gp_entdecken.json")) {
    return jsonResponse(discoverItems);
  }

  return Promise.reject(
    new Error(`Unmocked fetch in LayerCatalog.spec: ${url}`)
  );
};

const backgroundLayer = {
  id: "karte",
  title: "Stadtplan",
  opacity: 1,
  visible: true,
  layerType: "vector",
  description: "",
  inhalt: "",
  eignung: "",
  layers: "",
  props: { name: "", url: "" },
} as unknown as ActiveLayers[0];

// the self-mounted provider derives this from the appKey prop
const FAVORITES_KEY = "@geoportal-test.defaultStorage.catalog.favorites";

const testCatalogConfig = {
  ...wuppLayerCatalogConfig,
  discoverProps: {
    appKey: "geoportal-test",
    apiUrl: "https://wunda-cloud-api.cismet.de",
    daqKey: "gp_entdecken",
  },
};

const buildProps = (
  overrides: Partial<Parameters<typeof LayerCatalog>[0]> = {}
) => ({
  open: true,
  setOpen: vi.fn(),
  setAdditionalLayers: vi.fn(),
  updateActiveLayer: vi.fn(),
  setFeatureFlags: vi.fn(),
  customCategories: [],
  activeLayers: [backgroundLayer] as ActiveLayers,
  config: testCatalogConfig,
  appKey: "geoportal-test",
  ...overrides,
});

const renderModal = (
  overrides: Partial<Parameters<typeof LayerCatalog>[0]> = {}
) => {
  const props = buildProps(overrides);
  const view = render(<LayerCatalog {...props} />);

  return { ...view, props };
};

const findLayerCard = async (title: string) => {
  const titleElement = await screen.findByText(title, undefined, {
    timeout: 8000,
  });
  const card = titleElement.closest('[data-test-id="card-layer-prev"]');
  expect(card).not.toBeNull();
  return card as HTMLElement;
};

describe("LayerCatalog", () => {
  beforeAll(() => {
    configure({ testIdAttribute: "data-test-id" });
  });

  beforeEach(() => {
    // isolate the localforage-backed query cache (persisted capabilities)
    window.localStorage.clear();
    vi.stubGlobal("fetch", vi.fn(routedFetch));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fills the map layer categories from capabilities and additional configs", async () => {
    renderModal();

    // category and layers derived from the WMS capabilities + baseConfig
    await screen.findByText("Stadtgrundkarte (grau)", undefined, {
      timeout: 8000,
    });
    expect(screen.getAllByText("Basis").length).toBeGreaterThan(0);

    // layer only present in the capabilities, appended to the category
    expect(screen.getByText("Testebene ohne Konfiguration")).toBeTruthy();

    // layer hidden via carmaconf://hideLayer keyword
    expect(screen.queryByText("Amtliche Basiskarte (farbig)")).toBeNull();

    // replaceId from the additional config swaps the capabilities layer
    await screen.findByText("ALKIS Ersatzkarte (Test)", undefined, {
      timeout: 8000,
    });
    expect(screen.queryByText("ALKIS Strichkarte (gelb)")).toBeNull();

    // additional config category with own title
    expect(screen.getAllByText("Zusatzebenen").length).toBeGreaterThan(0);
    expect(screen.getByText("Zusatz Testlayer")).toBeTruthy();

    // feature flag layers stay hidden without the active flag
    expect(screen.queryByText("Featureflag Testlayer")).toBeNull();
  });

  it("fills the sensor, object and discover categories", async () => {
    renderModal();

    await screen.findByText("Stadtgrundkarte (grau)", undefined, {
      timeout: 8000,
    });

    fireEvent.click(screen.getByText("Sensoren"));
    await screen.findByText("Bodenfeuchte Testsensor", undefined, {
      timeout: 8000,
    });
    expect(screen.getAllByText("Boden").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByText("Objekte"));
    await screen.findByText("Testgebäude 3D", undefined, { timeout: 8000 });
    expect(screen.getAllByText("Gebäude").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByText("Entdecken"));
    await screen.findByText(
      "Liegenschaftskarte Testzusammenstellung",
      undefined,
      { timeout: 8000 }
    );
    expect(screen.getByText("POI Testkarte (Entwurf)")).toBeTruthy();
    // draft ribbon for draft discover items
    expect(screen.getByText("Entwurf")).toBeTruthy();
  });

  it("adds a layer to the map via the card button", async () => {
    const { props } = renderModal();

    const card = await findLayerCard("Stadtgrundkarte (grau)");
    fireEvent.click(within(card).getByTestId("apply-layer-to-map"));

    expect(props.setAdditionalLayers).toHaveBeenCalledTimes(1);
    expect(props.setAdditionalLayers).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "wuppKarten:alkomgw",
        title: "Stadtgrundkarte (grau)",
      }),
      false,
      false,
      false
    );
  });

  it("adds and removes favorites via the card star", async () => {
    renderModal();

    const card = await findLayerCard("Stadtgrundkarte (grau)");
    fireEvent.click(within(card).getByTestId("add-layer-favorite"));

    // the star flips to the filled state backed by the provider favorites
    await within(card).findByTestId("remove-layer-favorite");

    // and the favorite is persisted for the next session
    await waitFor(async () => {
      expect(await localForage.getItem(FAVORITES_KEY)).toEqual([
        expect.objectContaining({ id: "fav_wuppKarten:alkomgw" }),
      ]);
    });

    fireEvent.click(within(card).getByTestId("remove-layer-favorite"));
    await within(card).findByTestId("add-layer-favorite");
    await waitFor(async () => {
      expect(await localForage.getItem(FAVORITES_KEY)).toEqual([]);
    });
  });

  it("shows the filled favorite star for persisted favorites", async () => {
    await localForage.setItem(FAVORITES_KEY, [
      {
        id: "fav_wuppKarten:alkomgw",
        title: "Stadtgrundkarte (grau)",
        type: "layer",
        serviceName: "wuppKarten",
      },
    ]);

    renderModal();

    const card = await findLayerCard("Stadtgrundkarte (grau)");
    await within(card).findByTestId("remove-layer-favorite");
    expect(within(card).queryByTestId("add-layer-favorite")).toBeNull();

    // the lib-default favorites subcategory lists the favorite
    fireEvent.click(screen.getByText("Favoriten"));
    const headings = await screen.findAllByText(
      "Meine Kartenebenen",
      undefined,
      {
        timeout: 8000,
      }
    );
    expect(headings.length).toBeGreaterThan(0);
  });

  it("imports favorites once from a legacy redux-persist record", async () => {
    const legacyKey = "persist:@geoportal-test.1.app.layers";
    await localForage.setItem(
      legacyKey,
      JSON.stringify({
        favorites: JSON.stringify([{ id: "fav_wuppKarten:alkomgw" }]),
        thumbnails: JSON.stringify([]),
      })
    );

    // host-mounted provider (geoportal pattern); LayerCatalog reuses it
    render(
      <LayerCatalogProvider
        config={testCatalogConfig}
        appKey="geoportal-test"
        legacyFavoritesKey={legacyKey}
      >
        <LayerCatalog {...buildProps()} />
      </LayerCatalogProvider>
    );

    const card = await findLayerCard("Stadtgrundkarte (grau)");
    await within(card).findByTestId("remove-layer-favorite");

    // the import claimed the lib's own key, so it never runs again
    await waitFor(async () => {
      expect(await localForage.getItem(FAVORITES_KEY)).toEqual([
        { id: "fav_wuppKarten:alkomgw" },
      ]);
    });
  });

  it("opens the info card with title, description sections, links and legend", async () => {
    const { props } = renderModal();

    const card = await findLayerCard("Stadtgrundkarte (grau)");
    fireEvent.click(card);

    const infoCard = await screen.findByTestId("card-layer-detailed-info");
    const info = within(infoCard);

    // title
    expect(
      info.getByRole("heading", { name: "Stadtgrundkarte (grau)" })
    ).toBeTruthy();

    // description sections parsed from the abstract, Sichtbarkeit stays hidden
    expect(info.getByText("Inhalt")).toBeTruthy();
    expect(
      info.getByText(
        "Aus dem Liegenschaftskataster erzeugte Hintergrundkarte in Graustufen."
      )
    ).toBeTruthy();
    expect(info.getByText("Nutzung")).toBeTruthy();
    expect(info.queryByText("Sichtbarkeit")).toBeNull();

    // links to the WMS capabilities and the open data portal
    const capabilitiesLink = info.getByRole("link", {
      name: "Inhaltsverzeichnis des Kartendienstes (WMS Capabilities)",
    });
    expect(capabilitiesLink.getAttribute("href")).toBe(
      "https://maps.wuppertal.de/karten?service=WMS&request=GetCapabilities&version=1.1.1"
    );
    const openDataLink = info.getByRole("link", {
      name: "Datenquelle im Open-Data-Portal Wuppertal",
    });
    expect(openDataLink.getAttribute("href")).toBe(
      "https://offenedaten-wuppertal.de/dataset/alkomgw"
    );

    // legend image from the capabilities style
    expect(info.getByText("Legende")).toBeTruthy();
    expect(info.getByAltText("Legende").getAttribute("src")).toBe(
      "https://example.test/legenden/alkomgw-legende.png"
    );

    // tag footer
    expect(info.getByText("Basis")).toBeTruthy();

    // action buttons work from the info card as well
    fireEvent.click(info.getByRole("button", { name: /Hinzufügen/ }));
    expect(props.setAdditionalLayers).toHaveBeenCalledWith(
      expect.objectContaining({ id: "wuppKarten:alkomgw" }),
      false,
      false,
      false
    );
    fireEvent.click(info.getByRole("button", { name: /Favorisieren/ }));
    await info.findByRole("button", { name: /Favorit entfernen/ });
  });

  it("remounts cleanly with a persisted capabilities cache (page refresh)", async () => {
    const first = renderModal();
    await screen.findByText("Stadtgrundkarte (grau)", undefined, {
      timeout: 8000,
    });
    // let the throttled persister flush the capabilities to storage
    await new Promise((resolve) => setTimeout(resolve, 1200));
    first.unmount();

    // fresh provider + fresh QueryClient over the same storage = page refresh
    renderModal();
    await screen.findByText("Stadtgrundkarte (grau)", undefined, {
      timeout: 8000,
    });
    await screen.findByText("ALKIS Ersatzkarte (Test)", undefined, {
      timeout: 8000,
    });
  });

  it("shows a dropped vector style at the top of the catalog", async () => {
    renderModal();
    await screen.findByText("Stadtgrundkarte (grau)", undefined, {
      timeout: 8000,
    });

    const style = {
      version: 8,
      layers: [],
      metadata: {
        carmaConf: { layerInfo: { title: "Dropped Style Layer" } },
      },
    };
    const file = new File([JSON.stringify(style)], "dropped.style.json", {
      type: "application/json",
    });
    fireEvent.drop(window, {
      dataTransfer: { files: [file], getData: () => "" },
    });

    await screen.findByText("Dropped Style Layer", undefined, {
      timeout: 8000,
    });

    // the dropped item leads the catalog: "Externe Dienste" is the first
    // rendered subcategory of the map layers grid
    const scrollContainer = document.getElementById("scrollContainer");
    const headings = scrollContainer?.querySelectorAll("p.text-2xl");
    expect(headings?.[0]?.textContent).toBe("Externe Dienste");
  });

  it("applies a dropped layer config to the current catalog", async () => {
    renderModal();
    await screen.findByText("Stadtgrundkarte (grau)", undefined, {
      timeout: 8000,
    });
    await screen.findByText("Zusatz Testlayer", undefined, { timeout: 8000 });

    const droppedConfig = [
      {
        // new category with a new layer
        Title: "Drop Kategorie",
        serviceName: "dropTest",
        layers: [
          {
            id: "dropTest:neu",
            type: "layer",
            layerType: "vector",
            title: "Drop Testlayer",
            description: "Inhalt: Per Drop ergänzte Testebene.",
            tags: ["Drop"],
          },
        ],
      },
      {
        // override a layer that came from the fetched additional config
        Title: "Zusatzebenen",
        serviceName: "zusatzTest",
        layers: [
          {
            id: "zusatzTest:testlayer",
            title: "Zusatz Testlayer (geändert)",
          },
        ],
      },
      {
        // replace a layer that came from the WMS capabilities
        layers: [
          {
            id: "drop:alkomgw-ersatz",
            replaceId: "wuppKarten:alkomgw",
            path: "Basis",
            type: "layer",
            layerType: "vector",
            title: "Stadtgrundkarte Ersatz (Drop)",
            description: "Inhalt: Per Drop ersetzte Stadtgrundkarte.",
          },
        ],
      },
    ];
    const configJson = JSON.stringify(droppedConfig);
    const file = new File([configJson], "dropped-layer-config.json", {
      type: "application/json",
    });
    // jsdom's File misses Blob.text()
    Object.defineProperty(file, "text", {
      value: () => Promise.resolve(configJson),
    });
    fireEvent.drop(window, {
      dataTransfer: { files: [file], getData: () => "" },
    });

    // new layer in its new category
    await screen.findByText("Drop Testlayer", undefined, { timeout: 8000 });
    expect(screen.getAllByText("Drop Kategorie").length).toBeGreaterThan(0);

    // existing additional-config layer changed in place
    await screen.findByText("Zusatz Testlayer (geändert)", undefined, {
      timeout: 8000,
    });
    expect(screen.queryByText("Zusatz Testlayer")).toBeNull();

    // WMS-derived layer swapped via replaceId
    await screen.findByText("Stadtgrundkarte Ersatz (Drop)", undefined, {
      timeout: 8000,
    });
    await waitFor(() => {
      expect(screen.queryByText("Stadtgrundkarte (grau)")).toBeNull();
    });
  });

  it("clears the loading state when capabilities fail to load", async () => {
    // capabilities AND the additional layer config fail, so the map layers
    // grid has no content at all and its state is purely loading-driven
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (
          url.includes("maps.wuppertal.de") ||
          url.includes("additionalLayerConfig.json")
        ) {
          return Promise.reject(new Error("network down"));
        }
        return routedFetch(input);
      })
    );

    renderModal();

    // loading skeletons show while the capabilities requests are pending ...
    await waitFor(() => {
      expect(document.querySelector(".animate-pulse")).not.toBeNull();
    });

    // ... and clear once every request has failed (instead of spinning forever)
    await waitFor(
      () => {
        expect(document.querySelector(".animate-pulse")).toBeNull();
      },
      { timeout: 8000 }
    );
  });
});
